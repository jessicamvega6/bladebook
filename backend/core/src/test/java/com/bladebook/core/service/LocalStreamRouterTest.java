package com.bladebook.core.service;

import com.bladebook.core.data.DynamoDbLocal;
import com.bladebook.core.data.LocalStream;
import com.bladebook.core.data.NotifyRepository;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The local stand-in for EventBridge's rules (SC-20). The flows it carries are in {@link NotificationServiceTest}; here, what
 * it ignores and that it never throws.
 */
class LocalStreamRouterTest {

    private final DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
    private final LocalOutbox outbox = new LocalOutbox(Clock.fixed(Instant.parse("2026-11-16T12:00:00Z"), ZoneOffset.UTC));
    private final LocalStreamRouter router = new LocalStreamRouter(new NotificationService(new NotifyRepository(f.clients, f.table), outbox,
            new NotificationService.Links("https://bladebook.test"), Clock.systemUTC()));

    @Test
    void familyItemsAndUnknownKeysSendNothing() {
        router.route(List.of(new LocalStream.Key("CLIENT#f1", "PROFILE"), new LocalStream.Key("COACH#c1", "STUDENT#s1"),
                new LocalStream.Key("COACH#c1", "SEAT#bad"), new LocalStream.Key("COACH#c1", "CHANGEBATCH#2026-11-16T00:00:00.000Z#b1"),
                new LocalStream.Key("COACH#c1", "SEAT#2026-11-16#06:00#s1"), new LocalStream.Key("COACH#c1", "LESSON#2026-11-16#06:00")));
        assertThat(outbox.list()).isEmpty();
    }

    @Test
    void drainingAnIdleStreamDoesNothing() {
        LocalStream s = f.clients.localStream();
        s.switchOn();
        router.drain(s);
        assertThat(outbox.list()).isEmpty();
    }

    @Test
    void aWriteIsHandedOnAndTheStreamLeftEmpty() {
        LocalStream s = f.clients.localStream();
        s.switchOn();
        f.clients.forSetup().putItem(b -> b.tableName(f.table).item(Map.of("PK", AttributeValue.fromS("COACH#c1"),
                "SK", AttributeValue.fromS("LESSON#2026-11-16#06:00"))));
        router.drain(s);
        assertThat(s.drain()).isEmpty();
    }
}
