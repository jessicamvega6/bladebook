package com.bladebook.api.client.config;

import com.bladebook.core.data.CodeRepository;
import com.bladebook.core.data.FamilyRepository;
import com.bladebook.core.data.LocalTable;
import com.bladebook.core.data.SyncRepository;
import com.bladebook.core.data.TenantClients;
import com.bladebook.core.domain.RegistrationNumbers;
import com.bladebook.core.domain.RegistrationRules;
import com.bladebook.core.service.CodeLookupService;
import com.bladebook.core.service.FamilySyncService;
import com.bladebook.core.service.FamilyService;
import com.bladebook.core.service.RegistrationService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.net.URI;
import java.time.Clock;
import java.util.UUID;

/** Wires core/ into Spring. core/ itself has no Spring in it (ADR-001). */
@Configuration
public class CoreConfig {

    /** DynamoDB Local. {@link TenantClients#local} refuses any endpoint that isn't localhost. */
    @Bean
    @Profile("local")
    TenantClients localTenantClients(@Value("${bladebook.dynamodb.endpoint}") URI endpoint,
                                     @Value("${bladebook.table}") String table) {
        TenantClients clients = TenantClients.local(endpoint);
        LocalTable.ensure(clients.forSetup(), table);
        return clients;
    }

    /** USA Hockey's season check digit is a setting (ADR-029); off until both values are set. */
    @Bean
    RegistrationNumbers registrationNumbers(@Value("${bladebook.usa-hockey.check-digit-position:}") String position,
                                            @Value("${bladebook.usa-hockey.check-digit:}") String digit) {
        if (position.isBlank() || digit.isBlank()) {
            return RegistrationNumbers.withoutSeasonCheck();
        }
        return RegistrationNumbers.withSeasonCheck(Integer.parseInt(position.trim()), Integer.parseInt(digit.trim()));
    }

    @Bean
    CodeRepository codeRepository(TenantClients clients, @Value("${bladebook.table}") String table) {
        return new CodeRepository(clients, table);
    }

    @Bean
    FamilyRepository familyRepository(TenantClients clients, @Value("${bladebook.table}") String table) {
        return new FamilyRepository(clients, table);
    }

    @Bean
    CodeLookupService codeLookupService(CodeRepository codes) {
        return new CodeLookupService(codes);
    }

    @Bean
    FamilyService familyService(FamilyRepository families) {
        return new FamilyService(families);
    }

    @Bean
    RegistrationService registrationService(CodeRepository codes, FamilyRepository families, RegistrationNumbers numbers,
                                            FamilyService familyService, Clock clock) {
        return new RegistrationService(codes, families, new RegistrationRules(numbers), familyService,
                () -> UUID.randomUUID().toString(), clock);
    }

    /** What consumer-family-sync will run on AWS; locally {@code LocalEventDispatcher} calls it. */
    @Bean
    FamilySyncService familySyncService(TenantClients clients, @Value("${bladebook.table}") String table) {
        return new FamilySyncService(new SyncRepository(clients, table));
    }
}
