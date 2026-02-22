package com.pdfforms.model;

public enum SignaturePermissionLevel {
    NO_CHANGES(1),
    FORM_FILL(2),
    ANNOTATE(3);

    private int level;

    SignaturePermissionLevel(int level) {
        this.level = level;
    }

    public int getLevel() {
        return level;
    }
}
