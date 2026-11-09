package br.dev.tigertech.petcore;

import org.junit.Test;
import static org.junit.Assert.*;

public class UrlPolicyTest {
    @Test public void acceptsOnlyExactHttpsAppOrigin() {
        assertTrue(UrlPolicy.isAppUrl(UrlPolicy.HOME));
        assertTrue(UrlPolicy.isAppUrl(UrlPolicy.ORIGIN + ":443/?reset=example#section"));
        assertTrue(UrlPolicy.isTrustedOrigin(UrlPolicy.ORIGIN));
        assertTrue(UrlPolicy.isTrustedOrigin(UrlPolicy.HOME));
        assertFalse(UrlPolicy.isTrustedOrigin(UrlPolicy.ORIGIN + "/api"));
        assertFalse(UrlPolicy.isTrustedOrigin(UrlPolicy.ORIGIN + "?x=1"));
    }
    @Test public void blocksCommonNavigationBypasses() {
        String[] values = {null, "", "http://petcore-homologacao.up.railway.app", UrlPolicy.ORIGIN + ":444/",
            "https://petcore-homologacao.up.railway.app.evil.test", "https://petcore-homologacao.up.railway.app@evil.test",
            "https://user@petcore-homologacao.up.railway.app", "file:///sdcard/a", "content://documents/a",
            "javascript:alert(1)", "data:text/html,a", "intent://open", " " + UrlPolicy.ORIGIN,
            "https://petcore-homologacao.up.railway.app\\@evil.test"};
        for (String value : values) assertFalse(String.valueOf(value), UrlPolicy.isAppUrl(value));
    }
    @Test public void externalIntentsRequireSafeSchemes() {
        assertTrue(UrlPolicy.isExternalHttps("https://pag.ae/82jFKCTjo"));
        assertTrue(UrlPolicy.isMailto("mailto:tigertechbr@outlook.com"));
        assertFalse(UrlPolicy.isExternalHttps("http://pag.ae/test"));
        assertFalse(UrlPolicy.isExternalHttps("https://user:password@pag.ae/test"));
        assertFalse(UrlPolicy.isExternalHttps("intent://pay"));
        assertFalse(UrlPolicy.isMailto("mailto:"));
    }
}
