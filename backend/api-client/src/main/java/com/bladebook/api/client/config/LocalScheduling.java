package com.bladebook.api.client.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;

/** <b>Local profile only; a listed shortcut.</b> Runs the local stand-in for the Scheduler: the hourly deadline sweep. */
@Configuration
@Profile("local")
@EnableScheduling
public class LocalScheduling {
}
