package com.bladebook.core.service;

import com.bladebook.core.data.LocalStream;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * <b>Local profile only; a listed shortcut (SC-20).</b> What EventBridge's rules do with the table's stream on AWS: hands
 * each written item to the consumers that care about it, by its key (ADR-MASTER section 2).
 * <ul>
 *   <li>{@code CHANGEBATCH#…}: the change notifier;</li>
 *   <li>{@code SEAT#…}: the booking confirmation, the payment reminder ({@code CheckInRecorded}) and {@code consumer-invite}'s
 *       emails for that lesson;</li>
 *   <li>{@code SEATEND#…}: {@code consumer-invite}'s emails for that lesson.</li>
 * </ul>
 * The "keep or cancel" email goes with the leaving family's {@code CHANGEBATCH#} header (G-38, 2026-11-13), so a series
 * stopped in one go is one email.
 * Each consumer re-reads the item and checks its guard, so a key seen twice, or a consumer's own guard write coming back,
 * does nothing. {@link #drain} repeats until no new keys appear (a few rounds at most).
 */
public final class LocalStreamRouter {

    private static final Logger LOG = Logger.getLogger(LocalStreamRouter.class.getName());
    private static final int MAX_ROUNDS = 5;

    private final NotificationService notifications;

    public LocalStreamRouter(NotificationService notifications) {
        this.notifications = notifications;
    }

    /** Hands every key written so far on this thread to the consumers, until nothing new is written. Never throws. */
    public void drain(LocalStream stream) {
        for (int round = 0; round < MAX_ROUNDS; round++) {
            List<LocalStream.Key> keys = stream.drain();
            if (keys.isEmpty()) {
                return;
            }
            route(keys);
        }
        stream.drain(); // a consumer that keeps writing would loop; its guard should have stopped it
    }

    void route(List<LocalStream.Key> keys) {
        Map<String, List<String>> batches = new LinkedHashMap<>();
        Map<String, List<String>> seats = new LinkedHashMap<>();
        Set<List<String>> lessons = new LinkedHashSet<>();
        for (LocalStream.Key k : keys) {
            if (!k.pk().startsWith("COACH#")) {
                continue;
            }
            String coachId = k.pk().substring("COACH#".length());
            String[] p = k.sk().split("#");
            if (k.sk().startsWith("CHANGEBATCH#")) {
                batches.computeIfAbsent(coachId, x -> new ArrayList<>()).add(k.sk());
            } else if (k.sk().startsWith("SEAT#") && p.length >= 4) {
                seats.computeIfAbsent(coachId, x -> new ArrayList<>()).add(k.sk());
                lessons.add(List.of(coachId, p[1], p[2]));
            } else if (k.sk().startsWith("SEATEND#") && p.length >= 3) {
                lessons.add(List.of(coachId, p[1], p[2]));
            }
        }
        batches.forEach((coachId, sks) -> sks.forEach(sk -> safely("change notifier", () -> notifications.changeBatch(coachId, sk))));
        seats.forEach((coachId, sks) -> {
            safely("booking confirmation", () -> notifications.confirmBookings(coachId, sks));
            sks.forEach(sk -> safely("payment reminder", () -> notifications.paymentReminder(coachId, sk)));
        });
        for (List<String> l : lessons) {
            safely("consumer-invite", () -> notifications.sharedLesson(l.get(0), LocalDate.parse(l.get(1)), LocalTime.parse(l.get(2))));
        }
    }

    /** One consumer failing doesn't stop the others; on AWS each has its own queue and retries. */
    private static void safely(String consumer, Supplier<?> run) {
        try {
            run.get();
        } catch (RuntimeException e) {
            LOG.log(Level.WARNING, consumer + " (local) failed; it runs again on the item's next write", e);
        }
    }
}
