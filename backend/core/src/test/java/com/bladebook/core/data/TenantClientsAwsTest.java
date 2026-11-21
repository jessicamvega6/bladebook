package com.bladebook.core.data;

import com.bladebook.core.domain.StudentStatus;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.sts.StsClient;
import software.amazon.awssdk.services.sts.model.AssumeRoleRequest;
import software.amazon.awssdk.services.sts.model.AssumeRoleResponse;
import software.amazon.awssdk.services.sts.model.Credentials;
import software.amazon.awssdk.services.sts.model.Tag;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** AWS mode (ADR-MASTER section 16): each request path is a tenant-role session carrying the caller's tags. */
class TenantClientsAwsTest {

    private static final TenantClients.Roles ROLES = new TenantClients.Roles(
            "arn:aws:iam::111111111111:role/coach-tenant", "arn:aws:iam::111111111111:role/client-tenant",
            "arn:aws:iam::111111111111:role/code-lookup");
    private static final String COACH = "11111111-aaaa-4bbb-8ccc-000000000001";
    private static final String FAMILY = "22222222-aaaa-4bbb-8ccc-000000000002";

    /** Records each AssumeRole call and hands back an hour's credentials. */
    static final class FakeSts implements StsClient {
        final List<AssumeRoleRequest> calls = new ArrayList<>();

        @Override
        public AssumeRoleResponse assumeRole(AssumeRoleRequest r) {
            calls.add(r);
            return AssumeRoleResponse.builder().credentials(Credentials.builder().accessKeyId("AKIA").secretAccessKey("s")
                    .sessionToken("t").expiration(Instant.now().plusSeconds(3600)).build()).build();
        }

        @Override
        public String serviceName() {
            return "sts";
        }

        @Override
        public void close() {
        }
    }

    private static Map<String, String> tags(AssumeRoleRequest r) {
        return r.tags().stream().collect(Collectors.toMap(Tag::key, Tag::value));
    }

    @Test
    void aCoachsRequestIsACoachTenantSessionTaggedWithTheirSub() {
        FakeSts sts = new FakeSts();
        TenantClients clients = TenantClients.aws(ROLES, sts);
        DynamoDbClient db = clients.clientFor(new AccessContext(COACH));

        clients.sessions().resolve(db);
        AssumeRoleRequest r = sts.calls.get(0);
        assertThat(r.roleArn()).isEqualTo(ROLES.coachTenant());
        assertThat(tags(r)).isEqualTo(Map.of("coachId", COACH));
        assertThat(r.sourceIdentity()).isEqualTo(COACH);
        assertThat(r.roleSessionName()).isEqualTo("coach-" + COACH);
        assertThat(r.durationSeconds()).isEqualTo(3600);
    }

    @Test
    void aFamilyHasAClientIdSessionAndOnePerCoachWithTheLinkStatus() {
        FakeSts sts = new FakeSts();
        TenantClients clients = TenantClients.aws(ROLES, sts);
        ClientContext family = new ClientContext(FAMILY);
        clients.clientFor(family);
        clients.clientFor(family, new LinkedCoach(COACH, StudentStatus.ACTIVE));
        clients.clientFor(family, new LinkedCoach("coach-2", StudentStatus.PENDING));

        List<AssumeRoleRequest> made = clients.sessions().requests();
        assertThat(made).extracting(AssumeRoleRequest::roleArn).containsOnly(ROLES.clientTenant());
        assertThat(made).extracting(TenantClientsAwsTest::tags).containsExactly(
                Map.of("clientId", FAMILY),
                Map.of("clientId", FAMILY, "coachId", COACH, "linkStatus", "ACTIVE"),
                Map.of("clientId", FAMILY, "coachId", "coach-2", "linkStatus", "PENDING"));
        assertThat(made).extracting(AssumeRoleRequest::sourceIdentity).containsOnly(FAMILY);
    }

    @Test
    void theCodeLookupIsUntaggedWithNoSourceIdentity() {
        TenantClients clients = TenantClients.aws(ROLES, new FakeSts());
        clients.forCodeLookup();
        AssumeRoleRequest r = clients.sessions().requests().get(0);
        assertThat(r.roleArn()).isEqualTo(ROLES.codeLookup());
        assertThat(r.hasTags()).isFalse();
        assertThat(r.sourceIdentity()).isNull();
    }

    @Test
    void aSessionIsReusedForTheSameTagsAndNotForOthers() {
        TenantClients clients = TenantClients.aws(ROLES, new FakeSts());
        DynamoDbClient a = clients.clientFor(new AccessContext(COACH));
        assertThat(clients.clientFor(new AccessContext(COACH))).isSameAs(a);
        assertThat(clients.clientFor(new AccessContext("someone-else"))).isNotSameAs(a);
        assertThat(clients.sessions().requests()).hasSize(2);
    }

    @Test
    void theCacheKeepsAtMostMaxSessions() {
        TenantClients clients = TenantClients.aws(ROLES, new FakeSts());
        for (int i = 0; i <= TenantClients.MAX_SESSIONS; i++) {
            clients.clientFor(new AccessContext("coach-" + i));
        }
        List<AssumeRoleRequest> kept = clients.sessions().requests();
        assertThat(kept).hasSize(TenantClients.MAX_SESSIONS);
        assertThat(tags(kept.get(0))).containsEntry("coachId", "coach-1"); // the least recently used went
    }

    @Test
    void aFunctionWithoutARoleCannotMakeThatSession() {
        TenantClients coachOnly = TenantClients.aws(new TenantClients.Roles(ROLES.coachTenant(), null, null), new FakeSts());
        assertThatThrownBy(() -> coachOnly.clientFor(new ClientContext(FAMILY))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(coachOnly::forCodeLookup).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void theLocalStandInsDoNotExistOnAws() {
        TenantClients clients = TenantClients.aws(ROLES, new FakeSts());
        assertThatThrownBy(clients::localStream).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(clients::forSetup).isInstanceOf(IllegalStateException.class);
        assertThat(clients.forConsumer()).isNotNull();
    }

    @Test
    void aConsumerWorksInACoachsPartitionThroughItsOwnRoleAndNeverAsAFamily() {
        FakeSts sts = new FakeSts();
        TenantClients clients = TenantClients.consumer(sts);
        DynamoDbClient db = clients.clientFor(new AccessContext(COACH));
        assertThat(db).isSameAs(clients.forConsumer());
        assertThat(sts.calls).isEmpty();
        assertThatThrownBy(() -> clients.clientFor(new ClientContext(FAMILY))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(clients::forCodeLookup).isInstanceOf(IllegalStateException.class);
        assertThat(sts.calls).isEmpty();
    }
}
