package com.bladebook.api.client.controller;

import com.bladebook.api.client.dto.BookingDtos.BookBody;
import com.bladebook.api.client.dto.BookingDtos.BookResponse;
import com.bladebook.api.client.dto.BookingDtos.LessonDto;
import com.bladebook.api.client.dto.BookingDtos.PageResponse;
import com.bladebook.api.client.security.CurrentFamily;
import com.bladebook.core.service.BookingService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Booking one lesson (ADR-MASTER section 7). The coach and skater IDs come from the family's own account and
 * are checked against its links before anything is read or written; a waiting skater is refused (409) and one
 * that was never the family's is a plain 404.
 */
@RestController
public class BookingController {

    private final BookingService bookings;

    public BookingController(BookingService bookings) {
        this.bookings = bookings;
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

    /** The family's lessons from today on, with every coach: Home's Today and Coming up. */
    @GetMapping("/api/client/lessons")
    public List<LessonDto> lessons(@AuthenticationPrincipal Jwt jwt) {
        return bookings.upcoming(CurrentFamily.of(jwt)).stream().map(LessonDto::of).toList();
    }
}
