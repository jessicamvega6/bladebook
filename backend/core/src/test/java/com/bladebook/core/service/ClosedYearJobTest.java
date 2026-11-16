package com.bladebook.core.service;

import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.DynamoDbLocal;
import com.bladebook.core.data.FinancialRepository;
import com.bladebook.core.data.NotifyRepository;
import com.bladebook.core.data.PaymentRepository;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.StudentRepository;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@code sched-year-close} on its own (Batch 26). Its flows with a coach's lessons (saved once, a second run changing nothing,
 * waiting for midnight in the coach's time zone) are in {@link FinancialServiceTest}.
 */
class ClosedYearJobTest {

    private final DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();
    private final Clock clock = Clock.fixed(Instant.parse("2027-01-01T14:00:00Z"), ZoneOffset.UTC);
    private final CoachRepository coaches = new CoachRepository(f.clients, f.table);
    private final PaymentService payments = new PaymentService(new PaymentRepository(f.clients, f.table),
            new ScheduleRepository(f.clients, f.table), new StudentRepository(f.clients, f.table), coaches, clock);
    private final FinancialService finances = new FinancialService(payments, coaches, new FinancialRepository(f.clients, f.table), clock);
    private final ClosedYearJob job = new ClosedYearJob(new NotifyRepository(f.clients, f.table), finances);

    @Test
    void withNoCoachesItDoesNothing() {
        assertThat(job.run(LocalDate.of(2027, 1, 1))).isEqualTo(new ClosedYearJob.Result(0, 0, 0, 0));
    }

    @Test
    void aCoachWhoseProfileCantBeReadIsSkippedAndTheRestGoOn() {
        f.clients.forSetup().putItem(b -> b.tableName(f.table).item(Map.of(
                "PK", AttributeValue.fromS("COACH#" + UUID.randomUUID()), "SK", AttributeValue.fromS("PROFILE"))));
        assertThat(job.run(LocalDate.of(2027, 1, 1))).isEqualTo(new ClosedYearJob.Result(0, 0, 0, 0));
    }
}
