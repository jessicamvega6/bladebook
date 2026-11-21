package com.bladebook.core.events;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@code consumer-ttl-archiver} (ADR-MASTER section 20): TTL removals only, one object per item, at a key from the item's. */
class TtlArchiveTest {

    record Put(String key, String body, Map<String, String> tags) {
    }

    private final List<Put> puts = new ArrayList<>();
    private final TtlArchive archive = new TtlArchive((k, b, t) -> puts.add(new Put(k, b, t)));

    private static final String TTL = "\"userIdentity\":{\"type\":\"Service\",\"principalId\":\"dynamodb.amazonaws.com\"},";

    private static String record(String eventName, String who, String pk, String sk, String oldImage) {
        return "{\"eventName\":\"" + eventName + "\"," + who + "\"dynamodb\":{\"ApproximateCreationDateTime\":1795046400,"
                + "\"Keys\":{\"PK\":{\"S\":\"" + pk + "\"},\"SK\":{\"S\":\"" + sk + "\"}}"
                + (oldImage == null ? "" : ",\"OldImage\":" + oldImage) + "}}";
    }

    private static String batch(String... records) {
        return "{\"Records\":[" + String.join(",", records) + "]}";
    }

    @Test
    void aTtlRemovalIsWrittenWithItsOldImageAtTheKeyFromTheItem() {
        String seat = "{\"PK\":{\"S\":\"COACH#c1\"},\"SK\":{\"S\":\"SEAT#2025-07-01#06:00#s1\"},\"studentId\":{\"S\":\"s1\"},"
                + "\"paymentStatus\":{\"S\":\"PAID\"},\"priceMinor\":{\"N\":\"5000\"}}";
        TtlArchive.Archived a = archive.run(batch(record("REMOVE", TTL, "COACH#c1", "SEAT#2025-07-01#06:00#s1", seat)));

        assertThat(a).isEqualTo(new TtlArchive.Archived(1, 0));
        Put p = puts.get(0);
        // 1795046400 is 2026-11-19 in UTC.
        assertThat(p.key()).startsWith("coach=c1/student=s1/type=SEAT/2026-11-19/").endsWith(".json");
        assertThat(p.key()).contains(TtlArchive.hash("COACH#c1\u0000SEAT#2025-07-01#06:00#s1"));
        assertThat(p.body()).contains("\"paymentStatus\":{\"S\":\"PAID\"}").contains("\"priceMinor\":{\"N\":\"5000\"}");
        assertThat(p.tags()).isEqualTo(Map.of("itemType", "SEAT"));
    }

    @Test
    void theSameItemAlwaysHasTheSameNameSoARetryRewritesIt() {
        String img = "{\"PK\":{\"S\":\"COACH#c1\"},\"SK\":{\"S\":\"LESSON#2025-07-01#06:00\"}}";
        String r = record("REMOVE", TTL, "COACH#c1", "LESSON#2025-07-01#06:00", img);
        archive.run(batch(r));
        archive.run(batch(r));
        assertThat(puts.get(0).key()).isEqualTo(puts.get(1).key()).contains("/student=none/type=LESSON/");
    }

    @Test
    void anythingButATtlRemovalIsLeftAlone() {
        String img = "{\"PK\":{\"S\":\"COACH#c1\"},\"SK\":{\"S\":\"LESSON#x\"}}";
        TtlArchive.Archived a = archive.run(batch(
                record("REMOVE", "", "COACH#c1", "LESSON#x", img),                                   // a person's delete
                record("REMOVE", "\"userIdentity\":{\"type\":\"Service\",\"principalId\":\"someone\"},", "COACH#c1", "LESSON#x", img),
                record("MODIFY", TTL, "COACH#c1", "LESSON#x", img),
                record("REMOVE", TTL, "COACH#c1", "LESSON#x", null)));                                // no image to keep
        assertThat(a).isEqualTo(new TtlArchive.Archived(0, 4));
        assertThat(puts).isEmpty();
    }

    @Test
    void aFamilyItemFilesUnderNoCoachAndABadBatchOrSettingIsRefused() {
        String img = "{\"PK\":{\"S\":\"CLIENT#f1\"},\"SK\":{\"S\":\"PROFILE\"}}";
        archive.run(batch(record("REMOVE", TTL, "CLIENT#f1", "PROFILE", img)));
        assertThat(puts.get(0).key()).startsWith("coach=none/student=none/type=PROFILE/");
        assertThatThrownBy(() -> archive.run("{}")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> TtlArchive.fromEnvironment(Map.<String, String>of()::get)).hasMessageContaining("BLADEBOOK_ARCHIVEBUCKET");
    }

    @Test
    void aStoreThatFailsFailsTheBatch() {
        TtlArchive failing = new TtlArchive((k, b, t) -> {
            throw new IllegalStateException("S3 refused it");
        });
        String img = "{\"PK\":{\"S\":\"COACH#c1\"},\"SK\":{\"S\":\"LESSON#x\"}}";
        assertThatThrownBy(() -> failing.run(batch(record("REMOVE", TTL, "COACH#c1", "LESSON#x", img)))).hasMessage("S3 refused it");
    }
}
