/**
 * Repositories: the only package allowed to reference DynamoDbClient (ArchUnit rule, ADR-MASTER section 1). Every read and write goes through here, under the caller's AccessContext.
 */
package com.bladebook.core.data;
