package com.pdfforms.model;

import lombok.Data;
import lombok.experimental.SuperBuilder;

import java.security.PrivateKey;
import java.security.cert.X509Certificate;

@SuperBuilder
@Data
public abstract class Signature {
    protected PrivateKey privateKey;
    protected X509Certificate certificate;
    protected String signerName;
}
