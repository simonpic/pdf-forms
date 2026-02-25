package com.pdfforms.dto;

import lombok.Data;

/**
 * Coordonnées choisies par le signataire pour positionner son apparence de signature.
 * Toutes les valeurs sont en points PDF (origine bas-gauche), converties côté frontend
 * avant envoi (même convention que les coordonnées de champs AcroForm).
 * <p>
 * Champ optionnel dans {@link FillAndSignRequest} : si absent, le backend utilise
 * la position par défaut (bas-droite de la dernière page).
 */
@Data
public class SignaturePlacement {
    /** Numéro de page 0-indexé. */
    private int page;
    private double x;
    private double y;
    private double width;
    private double height;
}
