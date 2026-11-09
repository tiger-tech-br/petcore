package br.dev.tigertech.petcore;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;

/** Pure Java validation; never interprets an export name as a filesystem path. */
public final class ExportPolicy {
    public static final int MAX_BYTES = 16 * 1024 * 1024;
    private ExportPolicy() {}

    public static byte[] utf8(String content) {
        if (content == null || content.length() > MAX_BYTES) throw new IllegalArgumentException("Arquivo acima do limite de 16 MiB.");
        try {
            ByteBuffer buffer = StandardCharsets.UTF_8.newEncoder()
                .onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .encode(CharBuffer.wrap(content));
            if (buffer.remaining() > MAX_BYTES) throw new IllegalArgumentException("Arquivo acima do limite de 16 MiB.");
            byte[] bytes = new byte[buffer.remaining()]; buffer.get(bytes); return bytes;
        } catch (CharacterCodingException exception) {
            throw new IllegalArgumentException("O arquivo contém texto inválido.");
        }
    }

    public static String filename(String input, String mime) {
        String extension;
        if ("text/csv".equals(mime)) extension = ".csv";
        else if ("application/json".equals(mime)) extension = ".json";
        else throw new IllegalArgumentException("Formato de exportação não permitido.");
        if (input == null || input.length() > 512) throw new IllegalArgumentException("Nome do arquivo inválido.");
        String name = input.replaceAll("[^A-Za-z0-9._ -]", "_").replaceFirst("^[. ]+", "").trim();
        if (name.toLowerCase(java.util.Locale.ROOT).endsWith(extension)) name = name.substring(0, name.length() - extension.length());
        if (name.isEmpty()) name = "petcore-export";
        if (name.length() > 96) name = name.substring(0, 96).trim();
        return name + extension;
    }
}
