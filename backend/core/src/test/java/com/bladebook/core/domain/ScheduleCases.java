package com.bladebook.core.domain;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Reads {@code schedule-cases.json} at the repository root: the cases the Java and TypeScript schedule
 * logic must both pass (ADR-013 decision 3b). The web's tests read the same file.
 */
final class ScheduleCases {

    private static final JsonNode ROOT = load();

    private ScheduleCases() {
    }

    static JsonNode section(String name) {
        JsonNode n = ROOT.get(name);
        if (n == null || !n.isArray() || n.isEmpty()) {
            throw new IllegalStateException("schedule-cases.json has no cases under " + name);
        }
        return n;
    }

    private static JsonNode load() {
        Path dir = Path.of("").toAbsolutePath();
        while (dir != null) {
            Path f = dir.resolve("schedule-cases.json");
            if (Files.exists(f)) {
                return JsonMapper.builder().build().readTree(f.toFile());
            }
            dir = dir.getParent();
        }
        throw new IllegalStateException("schedule-cases.json not found above " + Path.of("").toAbsolutePath());
    }

    // ------------------------------------------------------------- conversions

    static DayOfWeek day(int index) {
        return index == 0 ? DayOfWeek.SUNDAY : DayOfWeek.of(index);
    }

    static LocalTime time(JsonNode n) {
        return n == null || n.isNull() ? null : LocalTime.parse(n.asString());
    }

    static Integer integer(JsonNode n) {
        return n == null || n.isNull() ? null : n.asInt();
    }

    /** A template as the fixture writes it; a left-out field takes the default its "_about" names. */
    static BlockTemplate template(JsonNode t) {
        Set<DayOfWeek> days = EnumSet.noneOf(DayOfWeek.class);
        for (JsonNode d : t.get("days")) {
            days.add(day(d.asInt()));
        }
        Map<DayOfWeek, Set<LocalTime>> off = new HashMap<>();
        JsonNode offs = t.get("off");
        if (offs != null) {
            for (Map.Entry<String, JsonNode> e : offs.properties()) {
                Set<LocalTime> times = new LinkedHashSet<>();
                for (JsonNode x : e.getValue()) {
                    times.add(LocalTime.parse(x.asString()));
                }
                off.put(day(Integer.parseInt(e.getKey())), times);
            }
        }
        return new BlockTemplate(
                t.get("seq").asInt(),
                t.has("name") ? t.get("name").asString() : "",
                time(t.get("startTime")),
                time(t.get("endTime")),
                integer(t.get("lessonMinutes")),
                t.has("priceMinor") ? integer(t.get("priceMinor")) : Integer.valueOf(5000),
                t.has("maxSkaters") ? integer(t.get("maxSkaters")) : Integer.valueOf(1),
                t.has("iceType") ? (t.get("iceType").isNull() ? null : IceType.valueOf(t.get("iceType").asString())) : IceType.PUBLIC,
                days, off);
    }

    static List<BlockTemplate> templates(JsonNode arr) {
        List<BlockTemplate> out = new ArrayList<>();
        for (JsonNode t : arr) {
            out.add(template(t));
        }
        return out;
    }

    static List<String> strings(JsonNode arr) {
        List<String> out = new ArrayList<>();
        for (JsonNode s : arr) {
            out.add(s.asString());
        }
        return out;
    }
}
