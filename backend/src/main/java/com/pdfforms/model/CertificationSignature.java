package com.pdfforms.model;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.experimental.SuperBuilder;

@EqualsAndHashCode(callSuper = true)
@SuperBuilder
@Data
public class CertificationSignature extends Signature {
    private SignaturePermissionLevel permissionLevel;
}
