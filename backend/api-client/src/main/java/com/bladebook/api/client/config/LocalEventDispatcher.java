package com.bladebook.api.client.config;

import com.bladebook.core.data.ClientContext;
import com.bladebook.core.service.FamilySyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * <b>Local profile only; a listed shortcut.</b> On AWS a family's profile change reaches
 * {@code consumer-family-sync} through DynamoDB Streams and EventBridge. Neither runs locally, so this calls
 * the same core service in-process straight after the write (implementation plan, Question 4).
 */
@Component
@Profile("local")
public class LocalEventDispatcher {

    private static final Logger LOG = LoggerFactory.getLogger(LocalEventDispatcher.class);

    private final FamilySyncService familySync;

    public LocalEventDispatcher(FamilySyncService familySync) {
        this.familySync = familySync;
    }

    /** {@code FamilyChanged}. */
    public void familyChanged(ClientContext ctx) {
        LOG.info("FamilyChanged (local): {} coach records updated", familySync.familyChanged(ctx.clientId()));
    }
}
