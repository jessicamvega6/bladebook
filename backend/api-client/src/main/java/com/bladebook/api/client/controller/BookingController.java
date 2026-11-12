package com.bladebook.api.client.controller;

import com.bladebook.api.client.dto.BookingDtos.BookBody;
import com.bladebook.api.client.dto.BookingDtos.BookResponse;
import com.bladebook.api.client.dto.BookingDtos.CancelBody;
import com.bladebook.api.client.dto.BookingDtos.CancelResponse;
import com.bladebook.api.client.dto.BookingDtos.MyBookingsResponse;
import com.bladebook.api.client.dto.BookingDtos.MyLessonDto;
import com.bladebook.api.client.dto.BookingDtos.PageResponse;
import com.bladebook.api.client.security.CurrentFamily;
import com.bladebook.core.domain.DomainException;
import com.bladebook.core.service.BookingService;
import com.bladebook.core.service.CancellationService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * Booking one lesson (ADR-MASTER section 7). The coach and skater IDs come from the family's own account and
 * are checked against its links before anything is read or written; a waiting skater is refused (409) and one
 * that was never the family's is a plain 404.
 */
@RestController
public class BookingController {

    private final BookingService bookings;
    private final CancellationService cancellations;

    public BookingController(BookingService bookings, CancellationService cancellations) {
        this.bookings = bookings;
        this.cancellations = cancellations;
    }

    /** One coach's lesson times for one skater, across the whole booking window. */
    @GetMapping("/api/client/booking")
    public PageResponse page(@AuthenticationPrincipal Jwt jwt, @RequestParam String coachId, @RequestParam String studentId) {
        return PageResponse.of(bookings.page(CurrentFamily.of(jwt), coachId, studentId));
    }

    /** Books each pick with one coach. A taken or vanished time is reported, never retried for another. */
    @PostMapping("/api/client/bookings")
    public BookResponse book(@AuthenticationPrincipal Jwt jwt, @RequestBody BookBody body) {
        return BookResponse.of(bookings.book(CurrentFamily.of(jwt), body.toRequest()));
    }

    /** My bookings: every lesson not started yet, with its price, and the last four that have. */
    @GetMapping("/api/client/bookings")
    public MyBookingsResponse myBookings(@AuthenticationPrincipal Jwt jwt) {
        return MyBookingsResponse.of(bookings.myBookings(CurrentFamily.of(jwt)));
    }

    /** Cancels one of the family's own lessons. Asking again for one already gone answers {@code ALREADY_CANCELLED}. */
    @PostMapping("/api/client/bookings/cancel")
    public CancelResponse cancel(@AuthenticationPrincipal Jwt jwt, @RequestBody CancelBody body) {
        return CancelResponse.of(cancellations.cancel(CurrentFamily.of(jwt), body.coachId(), body.studentId(),
                date(body.date()), time(body.startTime())));
    }

    private static LocalDate date(String v) {
        try {
            return LocalDate.parse(v);
        } catch (DateTimeParseException | NullPointerException e) {
            throw DomainException.invalid("date", "That date isn’t valid.");
        }
    }

    private static LocalTime time(String v) {
        try {
            return LocalTime.parse(v);
        } catch (DateTimeParseException | NullPointerException e) {
            throw DomainException.invalid("startTime", "That time isn’t valid.");
        }
    }

    /** The family's lessons from today on, with every coach: Home's Today and Coming up. */
    @GetMapping("/api/client/lessons")
    public List<MyLessonDto> lessons(@AuthenticationPrincipal Jwt jwt) {
        return bookings.upcoming(CurrentFamily.of(jwt)).stream().map(MyLessonDto::of).toList();
    }
}
