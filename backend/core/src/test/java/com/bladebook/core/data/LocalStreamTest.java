package com.bladebook.core.data;

import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ConditionalCheckFailedException;
import software.amazon.awssdk.services.dynamodb.model.Put;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The local stand-in for the table's stream (SC-20): which writes it records, and only when switched on. */
class LocalStreamTest {

    private final DynamoDbLocal.Fixture f = DynamoDbLocal.freshTable();

    private static Map<String, AttributeValue> item(String pk, String sk) {
        return Map.of("PK", AttributeValue.fromS(pk), "SK", AttributeValue.fromS(sk));
    }

    @Test
    void offItRecordsNothing() {
        LocalStream s = f.clients.localStream();
        f.clients.forSetup().putItem(b -> b.tableName(f.table).item(item("COACH#a", "X")));
        assertThat(s.drain()).isEmpty();
    }

    @Test
    void onItRecordsEachWriteOnceInOrder() {
        LocalStream s = f.clients.localStream();
        s.switchOn();
        var db = f.clients.forSetup();
        db.putItem(b -> b.tableName(f.table).item(item("COACH#a", "ONE")));
        db.updateItem(b -> b.tableName(f.table).key(item("COACH#a", "ONE")).updateExpression("SET x = :x")
                .expressionAttributeValues(Map.of(":x", AttributeValue.fromS("y"))));
        db.transactWriteItems(b -> b.transactItems(TransactWriteItem.builder().put(Put.builder().tableName(f.table).item(item("COACH#a", "TWO")).build()).build()));
        db.deleteItem(b -> b.tableName(f.table).key(item("COACH#a", "TWO")));
        assertThat(s.drain()).containsExactly(new LocalStream.Key("COACH#a", "ONE"), new LocalStream.Key("COACH#a", "TWO"));
        assertThat(s.drain()).isEmpty();
    }

    @Test
    void aRefusedWriteIsntRecorded() {
        LocalStream s = f.clients.localStream();
        s.switchOn();
        assertThatThrownBy(() -> f.clients.forSetup().putItem(b -> b.tableName(f.table).item(item("COACH#a", "ONE"))
                .conditionExpression("attribute_exists(PK)"))).isInstanceOf(ConditionalCheckFailedException.class);
        assertThat(s.drain()).isEmpty();
    }

    @Test
    void readsPassStraightThrough() {
        f.clients.forSetup().putItem(b -> b.tableName(f.table).item(item("COACH#a", "ONE")));
        assertThat(f.clients.forSetup().getItem(b -> b.tableName(f.table).key(item("COACH#a", "ONE"))).item()).containsKey("PK");
    }

    @Test
    void theBackfillGivesOldSeatsTheirIndexKeysAndMarksThemConfirmed() {
        var db = f.clients.forSetup();
        Map<String, AttributeValue> seat = new java.util.HashMap<>(item("COACH#c1", "SEAT#2026-11-16#06:00#s1"));
        seat.put("lessonDate", AttributeValue.fromS("2026-11-16"));
        seat.put("startTime", AttributeValue.fromS("06:00"));
        seat.put("studentId", AttributeValue.fromS("s1"));
        seat.put("seatStatus", AttributeValue.fromS("CHECKED_IN"));
        db.putItem(b -> b.tableName(f.table).item(seat));
        Map<String, AttributeValue> paid = new java.util.HashMap<>(seat);
        paid.put("SK", AttributeValue.fromS("SEAT#2026-11-16#06:30#s2"));
        paid.put("startTime", AttributeValue.fromS("06:30"));
        paid.put("studentId", AttributeValue.fromS("s2"));
        paid.put("seatStatus", AttributeValue.fromS("BOOKED"));
        paid.put("paymentStatus", AttributeValue.fromS("PAID"));
        db.putItem(b -> b.tableName(f.table).item(paid));

        assertThat(LocalTable.backfillSeatIndexes(db, f.table)).isEqualTo(2);
        var a = db.getItem(b -> b.tableName(f.table).key(item("COACH#c1", "SEAT#2026-11-16#06:00#s1"))).item();
        assertThat(a.get("GSI2PK").s()).isEqualTo("DATE#2026-11-16");
        assertThat(a.get("GSI2SK").s()).isEqualTo("COACH#c1#06:00");
        assertThat(a.get("GSI3SK").s()).isEqualTo("UNPAID#2026-11-16#s1");
        assertThat(a).containsKeys("confirmationSent", "paymentReminderSent");
        var b2 = db.getItem(b -> b.tableName(f.table).key(item("COACH#c1", "SEAT#2026-11-16#06:30#s2"))).item();
        assertThat(b2).containsKey("GSI2PK").doesNotContainKey("GSI3PK").doesNotContainKey("paymentReminderSent");
        assertThat(LocalTable.backfillSeatIndexes(db, f.table)).isZero(); // safe every start
    }
}
