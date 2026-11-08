package com.bladebook.api.coach.config;

import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.LocalTable;
import com.bladebook.core.data.TenantClients;
import com.bladebook.core.service.CoachProfileService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.net.URI;

/** Wires core/ into Spring. core/ itself has no Spring in it (ADR-001). */
@Configuration
public class CoreConfig {

    /**
     * DynamoDB Local. {@link TenantClients#local} refuses any endpoint that isn't localhost. The
     * table is made on start if it's missing.
     */
    @Bean
    @Profile("local")
    TenantClients localTenantClients(@Value("${bladebook.dynamodb.endpoint}") URI endpoint,
                                     @Value("${bladebook.table}") String table) {
        TenantClients clients = TenantClients.local(endpoint);
        LocalTable.ensure(clients.forSetup(), table);
        return clients;
    }

    @Bean
    CoachRepository coachRepository(TenantClients clients, @Value("${bladebook.table}") String table) {
        return new CoachRepository(clients, table);
    }

    @Bean
    CoachProfileService coachProfileService(CoachRepository repo) {
        return new CoachProfileService(repo, CoachProfileService.randomCodes());
    }
}
