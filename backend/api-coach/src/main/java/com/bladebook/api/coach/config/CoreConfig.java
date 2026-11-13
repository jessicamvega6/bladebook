package com.bladebook.api.coach.config;

import com.bladebook.core.data.AttendanceRepository;
import com.bladebook.core.data.CancellationRepository;
import com.bladebook.core.data.PaymentRepository;
import com.bladebook.core.data.CoachRepository;
import com.bladebook.core.data.LocalTable;
import com.bladebook.core.data.ScheduleRepository;
import com.bladebook.core.data.StudentRepository;
import com.bladebook.core.data.SyncRepository;
import com.bladebook.core.data.TenantClients;
import com.bladebook.core.service.AttendanceService;
import com.bladebook.core.service.CalendarService;
import com.bladebook.core.service.PaymentService;
import com.bladebook.core.service.CoachCancelService;
import com.bladebook.core.service.CoachProfileService;
import com.bladebook.core.service.ScheduleChangeService;
import com.bladebook.core.service.ScheduleService;
import com.bladebook.core.service.StudentLinkService;
import com.bladebook.core.service.StudentService;
import com.bladebook.core.service.TempScheduleService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.net.URI;
import java.time.Clock;

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
        LocalTable.backfillSeatIndexes(clients.forSetup(), table); // seats from before Batch 13
        clients.localStream().switchOn(); // SC-20: each request's writes go to the consumers afterwards
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

    @Bean
    ScheduleRepository scheduleRepository(TenantClients clients, @Value("${bladebook.table}") String table) {
        return new ScheduleRepository(clients, table);
    }

    @Bean
    ScheduleService scheduleService(ScheduleRepository schedules, CoachRepository coaches) {
        return new ScheduleService(schedules, coaches);
    }

    /** What consumer-schedule-change will run on AWS; locally {@code LocalEventDispatcher} calls it. */
    @Bean
    ScheduleChangeService scheduleChangeService(ScheduleRepository schedules, CoachRepository coaches, Clock clock) {
        return new ScheduleChangeService(schedules, coaches, clock);
    }

    @Bean
    CalendarService calendarService(ScheduleRepository schedules, CoachRepository coaches, StudentRepository students, Clock clock) {
        return new CalendarService(schedules, coaches, students, clock);
    }

    /** The Payments page (Batch 8). */
    @Bean
    PaymentService paymentService(TenantClients clients, @Value("${bladebook.table}") String table, ScheduleRepository schedules,
                                  StudentRepository students, CoachRepository coaches, Clock clock) {
        return new PaymentService(new PaymentRepository(clients, table), schedules, students, coaches, clock);
    }

    /** Attendance: the rinkside page and the Lessons page (Batch 7). */
    @Bean
    AttendanceService attendanceService(TenantClients clients, @Value("${bladebook.table}") String table, ScheduleRepository schedules,
                                        StudentRepository students, CoachRepository coaches, Clock clock) {
        return new AttendanceService(new AttendanceRepository(clients, table), schedules, students, coaches,
                new CancellationRepository(clients, table), clock);
    }

    /** Time off and special schedules (Batch 6). */
    @Bean
    TempScheduleService tempScheduleService(ScheduleRepository schedules, CoachRepository coaches, ScheduleChangeService change, Clock clock) {
        return new TempScheduleService(schedules, coaches, change, clock);
    }

    /** Cancelling from the calendar (Batch 5). */
    @Bean
    CoachCancelService coachCancelService(ScheduleRepository schedules, TenantClients clients, @Value("${bladebook.table}") String table,
                                          Clock clock) {
        return new CoachCancelService(schedules, new CancellationRepository(clients, table), clock);
    }

    @Bean
    StudentRepository studentRepository(TenantClients clients, @Value("${bladebook.table}") String table) {
        return new StudentRepository(clients, table);
    }

    @Bean
    StudentService studentService(StudentRepository students) {
        return new StudentService(students);
    }

    /** What consumer-student-link will run on AWS; locally {@code LocalEventDispatcher} calls it. */
    @Bean
    StudentLinkService studentLinkService(TenantClients clients, @Value("${bladebook.table}") String table) {
        return new StudentLinkService(new SyncRepository(clients, table));
    }
}
