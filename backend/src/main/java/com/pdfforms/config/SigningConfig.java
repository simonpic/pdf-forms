package com.pdfforms.config;

import lombok.extern.slf4j.Slf4j;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.X509v3CertificateBuilder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.math.BigInteger;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.Date;

@Slf4j
@Configuration
public class SigningConfig {

    @Bean
    public KeyPair signingKeyPair() throws Exception {
        log.info("Génération du keypair RSA 2048 pour la signature...");
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA", "BC");
        kpg.initialize(2048, new SecureRandom());
        KeyPair keyPair = kpg.generateKeyPair();
        log.info("Keypair RSA généré.");
        return keyPair;
    }

    @Bean
    public X509Certificate signingCertificate(KeyPair signingKeyPair) throws Exception {
        log.info("Génération du certificat auto-signé X509...");
        X500Name issuer = new X500Name("CN=PDF Forms POC, O=POC, C=FR");
        BigInteger serial = BigInteger.valueOf(System.currentTimeMillis());
        Date from = new Date();
        Date to = new Date(from.getTime() + 365L * 24 * 60 * 60 * 1000);

        X509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(
                issuer, serial, from, to, issuer, signingKeyPair.getPublic());

        ContentSigner contentSigner = new JcaContentSignerBuilder("SHA256withRSA")
                .setProvider("BC")
                .build(signingKeyPair.getPrivate());

        X509Certificate cert = new JcaX509CertificateConverter()
                .setProvider("BC")
                .getCertificate(builder.build(contentSigner));

        log.info("Certificat auto-signé généré : {}", cert.getSubjectX500Principal());
        return cert;
    }
}
