package br.dev.tigertech.petcore;

import java.net.URI;
import java.net.URISyntaxException;

/** Shared allowlist: no credentials, alternate ports, suffixes or cleartext. */
public final class UrlPolicy {
    public static final String ORIGIN = "https://petcore-homologacao.up.railway.app";
    public static final String HOME = ORIGIN + "/";
    private static final String HOST = "petcore-homologacao.up.railway.app";
    private UrlPolicy() {}

    private static URI parse(String value) {
        if (value == null || value.length() > 8192 || !value.equals(value.trim())) return null;
        try { return new URI(value); } catch (URISyntaxException exception) { return null; }
    }

    public static boolean isAppUrl(String value) {
        URI uri = parse(value);
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
            && HOST.equalsIgnoreCase(uri.getHost()) && uri.getRawUserInfo() == null
            && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    public static boolean isTrustedOrigin(String value) {
        URI uri = parse(value);
        return isAppUrl(value) && uri.getRawQuery() == null && uri.getRawFragment() == null
            && (uri.getRawPath() == null || uri.getRawPath().isEmpty() || "/".equals(uri.getRawPath()));
    }

    public static boolean isExternalHttps(String value) {
        URI uri = parse(value);
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
            && uri.getHost() != null && uri.getRawUserInfo() == null
            && (uri.getPort() == -1 || uri.getPort() == 443) && !isAppUrl(value);
    }

    public static boolean isMailto(String value) {
        URI uri = parse(value);
        return uri != null && "mailto".equalsIgnoreCase(uri.getScheme())
            && uri.getRawSchemeSpecificPart() != null && !uri.getRawSchemeSpecificPart().isEmpty()
            && !value.contains("\r") && !value.contains("\n");
    }
}
