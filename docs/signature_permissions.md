# Niveaux de permission MDP dans une signature PDF

## Les deux types de signatures PDF

La spécification ISO 32000 définit deux types de signatures numériques pour un document PDF.

### Certification Signature

La Certification Signature est la **signature d'auteur**. Elle atteste de l'origine du document et définit contractuellement ce qui peut ou ne peut pas être modifié après sa pose. Elle doit obligatoirement être **la première signature du document** et il ne peut en exister **qu'une seule** par document. C'est elle qui porte le mécanisme DocMDP (voir section suivante) via le dictionnaire `/DocMDP` référencé dans `/Perms` au niveau du catalogue du document.

### Approval Signature

L'Approval Signature est la **signature d'approbation**. Elle exprime le consentement ou la validation d'un signataire sur le contenu du document à un instant donné. Un document peut contenir **plusieurs Approval Signatures**, apposées successivement par différents signataires. Chacune couvre l'intégralité des octets du fichier jusqu'à son point d'insertion, permettant ainsi de reconstituer l'historique des états du document. Les Approval Signatures doivent **respecter les permissions définies par la Certification Signature** si celle-ci est présente.

### Comparaison synthétique

| | Certification Signature | Approval Signature |
|---|---|---|
| Rôle | Attester l'origine et définir les permissions | Exprimer l'approbation d'un signataire |
| Nombre par document | **1 au maximum** | Illimité |
| Porte le DocMDP | **Oui** | Non |
| Position dans le document | Première signature | Après la certification |
| Structure PDF | Référencée dans `/Perms/DocMDP` | Champ de signature ordinaire |

---

## Contexte

Lorsqu'un document PDF est **certifié** (via une *Certification Signature*), une valeur de permission `/P` est inscrite dans le dictionnaire `DocMDP`. Cette valeur détermine ce qui est autorisé ou interdit après la certification pour l'ensemble de la vie du document.

---

## Les trois niveaux

| Valeur `/P` | Nom usuel | Ce qui est autorisé après certification |
|:-----------:|-----------|----------------------------------------|
| `1` | No changes | Aucune modification — document totalement verrouillé |
| `2` | Form fill | Remplissage de champs AcroForm + ajout de signatures |
| `3` | Annotate | Idem niveau 2 + ajout/modification d'annotations |

---

## Pourquoi le niveau 2 autorise-t-il la modification des champs AcroForm ?

La logique de la certification est la suivante : signer un document ne signifie pas nécessairement le figer dans son intégralité. Dans de nombreux workflows métiers, on souhaite **attester de l'état du document à un instant T tout en laissant la possibilité de compléter les champs** restants.

Le niveau `P=2` distingue deux catégories de modifications :

- **Les modifications structurelles** (contenu, mise en page, suppression de pages…) → **interdites**, car elles remettraient en cause l'intégrité du document certifié.
- **Le remplissage de champs AcroForm et l'ajout de signatures** → **autorisés**, car ils constituent une *complétion* du document, pas une altération.

Un lecteur PDF conforme (Adobe Acrobat, etc.) valide la signature de certification en vérifiant que seules des modifications appartenant à cette catégorie autorisée ont été effectuées. Si une modification structurelle est détectée, la signature est marquée invalide.

---

## Scénario simple : Formulaire signé puis complété

### Contexte

Un responsable RH prépare un formulaire de demande de congé en PDF.  
Il contient deux champs AcroForm :
- `date_depart` — à remplir par l'employé
- `validation_rh` — à remplir par le RH

L'objectif est que le RH **signe et certifie le document** pour en attester l'origine, tout en laissant l'employé **remplir son champ** par la suite.

### Étapes

```
1. Le RH crée le PDF avec les deux champs AcroForm vides.

2. Le RH appose une Certification Signature avec P=2.
   → Le document est certifié. Sa structure est figée.
   → Les champs AcroForm restent modifiables.

3. L'employé ouvre le document et saisit la valeur du champ `date_depart`.
   → Cette modification est autorisée par P=2.
   → La signature de certification reste valide.

4. Le RH remplit le champ `validation_rh` et appose une Approval Signature.
   → Cette deuxième signature s'inscrit dans le cadre de la certification.
   → Le document est désormais complet et doublement signé.
```

### Ce qui aurait invalider la signature

Si l'employé avait tenté de modifier le texte du document, de supprimer une page ou d'ajouter une annotation, la signature de certification aurait été marquée **invalide** par le reader.

---

## Implémentation avec PDFBox

```java
// Définir les permissions MDP lors de la Certification Signature
COSDictionary transformParams = new COSDictionary();
transformParams.setItem(COSName.TYPE, COSName.getPDFName("TransformParams"));
transformParams.setInt(COSName.P, 2); // Niveau 2 : champs AcroForm modifiables
transformParams.setName(COSName.V, "1.2");

COSDictionary reference = new COSDictionary();
reference.setItem(COSName.TYPE, COSName.getPDFName("SigRef"));
reference.setItem(COSName.getPDFName("TransformMethod"), COSName.getPDFName("DocMDP"));
reference.setItem(COSName.getPDFName("TransformParams"), transformParams);

COSArray referenceArray = new COSArray();
referenceArray.add(reference);

// Attacher au dictionnaire de la signature
signature.getCOSObject().setItem(COSName.getPDFName("Reference"), referenceArray);
```

> **Rappel :** La Certification Signature doit être la **première et unique** signature DocMDP du document. Elle est également référencée depuis `/Perms` dans le catalogue du document, ce que PDFBox gère automatiquement.

---

## Sources de référence



- **Adobe — Digital Signatures in a PDF** (document technique gratuit, très lisible) :
  https://www.adobe.com/devnet-docs/acrobatetk/tools/DigSigDC/Acrobat_DigitalSignatures_in_PDF.pdf

- **Javadoc `SigUtils`** (PDFBox 2.0.x) :
  https://pdfbox.apache.org/docs/2.0.13/javadocs/org/apache/pdfbox/examples/signature/SigUtils.html

- **iText — Attacks on PDF certification** — analyse détaillée des niveaux DocMDP et de leurs implications sécurité :
  https://itextpdf.com/blog/itext-news-technical-notes/attacks-pdf-certification-and-what-you-can-do-about-them