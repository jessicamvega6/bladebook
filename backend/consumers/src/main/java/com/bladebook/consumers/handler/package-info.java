/**
 * One plain RequestHandler per event consumer or scheduled job (ADR-MASTER section 2), all shipped in consumers.jar. No framework. Each handler is thin and calls a core service.
 */
package com.bladebook.consumers.handler;
