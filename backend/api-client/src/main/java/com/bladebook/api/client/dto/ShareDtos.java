package com.bladebook.api.client.dto;

import com.bladebook.core.service.CancellationService;
import com.bladebook.core.service.ShareService;

import java.time.LocalDate;
import java.util.List;

/**
 * Shared lessons' calls (ADR-MASTER section 8; Batch 11). Dates and times are the coach's local ones. No skater ID of
 * another family ever appears: a share code's answer is a display name.
 */
public final class ShareDtos {

    private ShareDtos() {
    }

    public record ShareCheckBody(String shareCode, String coachId) {
    }

    public record ShareCheckResponse(String displayName, boolean onCoachRoster) {
        public static ShareCheckResponse of(ShareService.ShareCheck c) {
            return new ShareCheckResponse(c.displayName(), c.onCoachRoster());
        }
    }

    public record InvitationDateDto(String date, String startTime, int durationMinutes, String startsAtUtc, boolean open) {
    }

    public record InvitationClashDto(String date, String startTime, String otherCoachFirstName, String otherStartTime,
                                     int otherDurationMinutes) {
    }

    /** {@code status}: OPEN, or EXPIRED once every date has started (worked out from the clock, B8). */
    public record InvitationDto(String inviteId, String coachId, String coachFirstName, String coachLastName, String studentId,
                                String studentName, String hostName, String invitedByName, boolean series, List<InvitationDateDto> dates,
                                Integer priceMinor, Integer shareMinor, int skaters, String currency, String status,
                                List<InvitationClashDto> clashes) {
        public static InvitationDto of(ShareService.Invitation i) {
            return new InvitationDto(i.inviteId(), i.coachId(), i.coachFirstName(), i.coachLastName(), i.studentId(), i.studentName(),
                    i.hostName(), i.invitedByName(), i.series(),
                    i.dates().stream().map(d -> new InvitationDateDto(d.date().toString(), d.startTime().toString(), d.durationMinutes(),
                            d.startsAtUtc().toString(), d.open())).toList(),
                    i.priceMinor(), i.shareMinor(), i.skaters(), i.currency(), i.status(),
                    i.clashes().stream().map(c -> new InvitationClashDto(c.date().toString(), c.startTime().toString(), c.otherCoachFirstName(),
                            c.otherStart().toString(), c.otherDurationMinutes())).toList());
        }
    }

    public record InviteBody(String inviteId) {
    }

    public record AnsweredDto(String studentName, String coachFirstName, String hostName, List<String> done, List<String> skipped) {
        public static AnsweredDto of(ShareService.Answered a) {
            return new AnsweredDto(a.studentName(), a.coachFirstName(), a.hostName(), dates(a.done()), dates(a.skipped()));
        }

        public static AnsweredDto of(CancellationService.Answered a) {
            return new AnsweredDto(null, null, null, dates(a.done()), dates(a.skipped()));
        }
    }

    /** The staying family's answer for one or several dates of one skater's lesson at one time. */
    public record WaitingBody(String coachId, String studentId, String startTime, List<String> dates) {
    }

    /** Invite a skater to a freed place: that one lesson only. */
    public record FreedPlaceBody(String coachId, String studentId, String date, String startTime, String shareCode) {
    }

    public record FilledDto(String displayName, boolean sibling) {
        public static FilledDto of(ShareService.Filled f) {
            return new FilledDto(f.displayName(), f.sibling());
        }
    }

    private static List<String> dates(List<LocalDate> ds) {
        return ds.stream().map(LocalDate::toString).toList();
    }
}
