package com.bladebook.core.data;

import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.BatchGetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.BatchGetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.CreateTableRequest;
import software.amazon.awssdk.services.dynamodb.model.CreateTableResponse;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemResponse;
import software.amazon.awssdk.services.dynamodb.model.DeleteTableRequest;
import software.amazon.awssdk.services.dynamodb.model.DeleteTableResponse;
import software.amazon.awssdk.services.dynamodb.model.DescribeTableRequest;
import software.amazon.awssdk.services.dynamodb.model.DescribeTableResponse;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemResponse;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsResponse;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemResponse;
import software.amazon.awssdk.services.dynamodb.model.UpdateTableRequest;
import software.amazon.awssdk.services.dynamodb.model.UpdateTableResponse;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * <b>Local stand-in for the table's stream; a listed shortcut (SC-20).</b> On AWS every committed write reaches the event
 * consumers through DynamoDB Streams, a Pipe and EventBridge (ADR-MASTER section 2). DynamoDB Local has no such path, so
 * the local client is wrapped in this: while it's switched on, each successful write records the item's key, on the
 * thread that made it, and the API hands the keys to the consumers once the request is done ({@link #drain}).
 *
 * <p>It records keys only, not images: the consumers read the item again and act on what's there now, each behind its own
 * guard attribute, so a key recorded twice, or a guard write recorded in turn, does nothing more. Deleted items are read
 * as gone and ignored. Off by default, so tests and tools see a plain client.
 */
public final class LocalStream implements DynamoDbClient {

    /** One written item. */
    public record Key(String pk, String sk) {
    }

    private final DynamoDbClient db;
    private final ThreadLocal<Set<Key>> written = ThreadLocal.withInitial(LinkedHashSet::new);
    private volatile boolean on;

    LocalStream(DynamoDbClient db) {
        this.db = db;
    }

    public void switchOn() {
        on = true;
    }

    /** The keys written on this thread since the last drain, oldest first; empty when switched off. */
    public List<Key> drain() {
        Set<Key> s = written.get();
        List<Key> out = new ArrayList<>(s);
        s.clear();
        return out;
    }

    private void record(Map<String, AttributeValue> key) {
        if (on && key != null && key.containsKey("PK") && key.containsKey("SK")) {
            written.get().add(new Key(key.get("PK").s(), key.get("SK").s()));
        }
    }

    // ------------------------------------------------------------------ writes, recorded

    @Override
    public PutItemResponse putItem(PutItemRequest r) {
        PutItemResponse out = db.putItem(r);
        record(r.item());
        return out;
    }

    @Override
    public UpdateItemResponse updateItem(UpdateItemRequest r) {
        UpdateItemResponse out = db.updateItem(r);
        record(r.key());
        return out;
    }

    @Override
    public DeleteItemResponse deleteItem(DeleteItemRequest r) {
        DeleteItemResponse out = db.deleteItem(r);
        record(r.key());
        return out;
    }

    @Override
    public TransactWriteItemsResponse transactWriteItems(TransactWriteItemsRequest r) {
        TransactWriteItemsResponse out = db.transactWriteItems(r);
        for (TransactWriteItem t : r.transactItems()) {
            if (t.put() != null) {
                record(t.put().item());
            } else if (t.update() != null) {
                record(t.update().key());
            } else if (t.delete() != null) {
                record(t.delete().key());
            }
        }
        return out;
    }

    // ------------------------------------------------------------- everything else, passed on

    @Override
    public GetItemResponse getItem(GetItemRequest r) {
        return db.getItem(r);
    }

    @Override
    public QueryResponse query(QueryRequest r) {
        return db.query(r);
    }

    @Override
    public ScanResponse scan(ScanRequest r) {
        return db.scan(r);
    }

    @Override
    public BatchGetItemResponse batchGetItem(BatchGetItemRequest r) {
        return db.batchGetItem(r);
    }

    @Override
    public DescribeTableResponse describeTable(DescribeTableRequest r) {
        return db.describeTable(r);
    }

    @Override
    public CreateTableResponse createTable(CreateTableRequest r) {
        return db.createTable(r);
    }

    @Override
    public UpdateTableResponse updateTable(UpdateTableRequest r) {
        return db.updateTable(r);
    }

    @Override
    public DeleteTableResponse deleteTable(DeleteTableRequest r) {
        return db.deleteTable(r);
    }

    @Override
    public String serviceName() {
        return db.serviceName();
    }

    @Override
    public void close() {
        db.close();
    }
}
