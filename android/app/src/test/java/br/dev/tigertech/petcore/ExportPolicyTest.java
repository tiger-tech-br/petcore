package br.dev.tigertech.petcore;

import org.junit.Test;
import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;

public class ExportPolicyTest {
    @Test public void exportsExactUtf8AndSafeExtensions() {
        String text = "Cliente;Valor\nJosé;35,00\n🐾";
        assertArrayEquals(text.getBytes(StandardCharsets.UTF_8), ExportPolicy.utf8(text));
        assertEquals("relatorio.csv", ExportPolicy.filename("relatorio.csv", "text/csv"));
        assertEquals("titular.json", ExportPolicy.filename("titular.json", "application/json"));
    }
    @Test public void sanitizesPathsControlsAndLength() {
        String name = ExportPolicy.filename("../../etc/arquivo\r\n.exe", "text/csv");
        assertFalse(name.contains("/")); assertFalse(name.contains("\\")); assertFalse(name.contains("\r"));
        assertFalse(name.startsWith(".")); assertTrue(name.endsWith(".csv"));
        assertTrue(ExportPolicy.filename("a".repeat(200), "application/json").length() <= 101);
        assertEquals("petcore-export.csv", ExportPolicy.filename("...", "text/csv"));
    }
    @Test public void rejectsUnsupportedFormatsAndMalformedText() {
        assertThrows(IllegalArgumentException.class, () -> ExportPolicy.filename("a.html", "text/html"));
        assertThrows(IllegalArgumentException.class, () -> ExportPolicy.filename("a", "application/octet-stream"));
        assertThrows(IllegalArgumentException.class, () -> ExportPolicy.utf8("\ud800"));
        assertThrows(IllegalArgumentException.class, () -> ExportPolicy.utf8(null));
    }
    @Test public void boundsBytesRatherThanCharacters() {
        assertEquals(ExportPolicy.MAX_BYTES, ExportPolicy.utf8("a".repeat(ExportPolicy.MAX_BYTES)).length);
        assertThrows(IllegalArgumentException.class, () -> ExportPolicy.utf8("a".repeat(ExportPolicy.MAX_BYTES + 1)));
        assertThrows(IllegalArgumentException.class, () -> ExportPolicy.utf8("é".repeat(ExportPolicy.MAX_BYTES / 2 + 1)));
    }
}
