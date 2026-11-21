package com.bladebook.core.data;

import com.bladebook.core.domain.StudentStatus;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The shared reader of the table's stream records, as the Pipe puts them on the bus (ADR-MASTER section 3, I6). */
class TableRecordTest {

    /** An EventBridge event as the Pipe sends it: the stream record is its detail. */
    static String event(String eventName, String keys, String newImage, String oldImage) {
        return """
                {"version":"0","id":"e1","detail-type":"TableRecord","source":"bladebook.table","account":"111111111111",
                 "time":"2026-11-18T12:00:00Z","region":"us-east-1","resources":[],
                 "detail":{"eventID":"r1","eventName":"%s","eventSource":"aws:dynamodb","awsRegion":"us-east-1",
                  "dynamodb":{"Keys":%s%s%s,"StreamViewType":"NEW_AND_OLD_IMAGES"}}}"""
                .formatted(eventName, keys, newImage == null ? "" : ",\"NewImage\":" + newImage,
                        oldImage == null ? "" : ",\"OldImage\":" + oldImage);
    }

    static String keys(String pk, String sk) {
        return "{\"PK\":{\"S\":\"" + pk + "\"},\"SK\":{\"S\":\"" + sk + "\"}}";
    }

    @Test
    void anEventsRecordIsReadWithEveryTypeTurnedBackIntoAttributeValues() {
        String image = """
                {"PK":{"S":"COACH#c1"},"SK":{"S":"SEAT#2026-11-16#06:00#s1"},"seatStatus":{"S":"BOOKED"},"priceMinor":{"N":"5000"},
                 "isMinor":{"BOOL":true},"gone":{"NULL":true},"blob":{"B":"aGk="},"pendingLeave":{"M":{"leaveId":{"S":"l1"}}},
                 "days":{"L":[{"S":"MON"},{"N":"2"}]},"tags":{"SS":["a","b"]},"nums":{"NS":["1","2"]},"blobs":{"BS":["aGk="]}}""";
        TableRecord r = TableRecord.parse(event("INSERT", keys("COACH#c1", "SEAT#2026-11-16#06:00#s1"), image, null));

        assertThat(r.change()).isEqualTo(TableRecord.Change.INSERT);
        assertThat(r.pk()).isEqualTo("COACH#c1");
        assertThat(r.sk()).isEqualTo("SEAT#2026-11-16#06:00#s1");
        assertThat(r.partitionId()).isEqualTo("c1");
        assertThat(r.newString("seatStatus")).contains("BOOKED");
        assertThat(r.newString("priceMinor")).isEmpty(); // a number isn't a string
        assertThat(r.oldString("seatStatus")).isEmpty();
        assertThat(r.hasNewImage()).isTrue();
        assertThat(r.hasOldImage()).isFalse();

        Map<String, AttributeValue> m = TableRecord.image(JsonMapper.builder().build().readTree(image));
        assertThat(m.get("priceMinor").n()).isEqualTo("5000");
        assertThat(m.get("isMinor").bool()).isTrue();
        assertThat(m.get("gone").nul()).isTrue();
        assertThat(m.get("blob").b()).isEqualTo(SdkBytes.fromUtf8String("hi"));
        assertThat(m.get("pendingLeave").m().get("leaveId").s()).isEqualTo("l1");
        assertThat(m.get("days").l()).containsExactly(AttributeValue.fromS("MON"), AttributeValue.fromN("2"));
        assertThat(m.get("tags").ss()).containsExactly("a", "b");
        assertThat(m.get("nums").ns()).containsExactly("1", "2");
        assertThat(m.get("blobs").bs()).containsExactly(SdkBytes.fromUtf8String("hi"));
    }

    @Test
    void aBareStreamRecordIsReadToo() {
        String bare = """
                {"eventName":"MODIFY","dynamodb":{"Keys":%s,"NewImage":{"clientName":{"S":"Kim Lee"}},"OldImage":{"clientName":{"S":"Kim"}}}}"""
                .formatted(keys("CLIENT#f1", "PROFILE"));
        TableRecord r = TableRecord.parse(bare);
        assertThat(r.change()).isEqualTo(TableRecord.Change.MODIFY);
        assertThat(r.partitionId()).isEqualTo("f1");
        assertThat(r.newString("clientName")).contains("Kim Lee");
        assertThat(r.oldString("clientName")).contains("Kim");
        assertThat(r.oldStudent()).isEmpty(); // not a coach's skater record
    }

    @Test
    void aRemovedSkaterRecordIsReadFromItsOldImage() {
        String old = """
                {"PK":{"S":"COACH#c1"},"SK":{"S":"STUDENT#s1"},"studentId":{"S":"s1"},"clientId":{"S":"f1"},
                 "studentStatus":{"S":"PENDING"},"studentName":{"S":"Sam Lee"},"isMinor":{"BOOL":true},
                 "clientRelationship":{"S":"GUARDIAN"},"clientName":{"S":"Kim Lee"},"clientEmail":{"S":"lee@example.com"},
                 "clientPhone":{"S":"(205) 555-0122"},"skatingOrg":{"S":"USFS"},"registrationNumber":{"S":"1234567"},
                 "signedUpAt":{"S":"2026-11-09T15:00:00Z"}}""";
        TableRecord r = TableRecord.parse(event("REMOVE", keys("COACH#c1", "STUDENT#s1"), null, old));
        assertThat(r.newStudent()).isEmpty();
        assertThat(r.oldStudent()).hasValueSatisfying(s -> {
            assertThat(s.coachId()).isEqualTo("c1");
            assertThat(s.studentId()).isEqualTo("s1");
            assertThat(s.clientId()).isEqualTo("f1");
            assertThat(s.status()).isEqualTo(StudentStatus.PENDING);
            assertThat(s.clientEmail()).isEqualTo("lee@example.com");
        });
    }

    @Test
    void itsTextGivesTheKeysAndNeverTheImages() {
        TableRecord r = TableRecord.parse(event("MODIFY", keys("CLIENT#f1", "PROFILE"),
                "{\"clientEmail\":{\"S\":\"lee@example.com\"}}", null));
        assertThat(r.toString()).contains("CLIENT#f1", "PROFILE").doesNotContain("lee@example.com");
    }

    @Test
    void anythingElseIsRefused() {
        assertThatThrownBy(() -> TableRecord.parse("{\"detail\":{\"hello\":1}}")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> TableRecord.parse("{\"eventName\":\"INSERT\",\"dynamodb\":{\"Keys\":{\"PK\":{\"S\":\"x\"}}}}"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> TableRecord.parse(event("INSERT", keys("COACH#c1", "PROFILE"), "{\"x\":{\"Q\":\"1\"}}", null)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> TableRecord.parse(event("INSERT", keys("COACH#c1", "PROFILE"), "{\"x\":{\"S\":\"1\",\"N\":\"1\"}}", null)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> TableRecord.parse(event("UPSERT", keys("COACH#c1", "PROFILE"), null, null)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(List.of(TableRecord.Change.values())).hasSize(3);
    }
}
