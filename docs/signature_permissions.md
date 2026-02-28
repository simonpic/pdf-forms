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

## FieldMDP — Verrouillage granulaire des champs

### Principe

Là où le DocMDP fixe une politique globale sur l'ensemble du document, le **FieldMDP** opère au niveau des champs AcroForm individuels. Il permet à une Approval Signature de déclarer explicitement **quels champs sont désormais verrouillés** à partir du moment où cette signature est apposée.

Le FieldMDP est porté par un dictionnaire `/SigFieldLock` attaché au champ de signature. Ce dictionnaire définit la liste des champs concernés et le sens du verrou via l'entrée `/Action` :

| Valeur `/Action` | Champs verrouillés après signature |
|---|---|
| `All` | Tous les champs du document |
| `Include` | Uniquement les champs listés dans `/Fields` |
| `Exclude` | Tous les champs **sauf** ceux listés dans `/Fields` |

### Comment le validator PDF l'évalue

Lors de la validation d'une Approval Signature porteuse d'un FieldMDP, le validator recalcule le hash couvrant les octets du document au moment de la signature, puis vérifie qu'aucun des champs désignés comme verrouillés n'a été modifié dans les révisions incrémentales ultérieures. Si un champ verrouillé a changé, la signature est marquée invalide.

### FieldMDP vs DocMDP — différences clés

| Critère | DocMDP | FieldMDP |
|---|---|---|
| Porté par | Certification Signature (unique) | Approval Signature (une par étape) |
| Granularité | Document entier | Champs individuels |
| Entrée PDF | `/Perms/DocMDP` dans le catalogue | `/SigFieldLock` sur le champ de signature |
| Paramètre de permission | `/P` (1, 2 ou 3) | `/Action` + `/Fields` |
| Objectif | Définir ce que les signataires suivants *peuvent* faire | Geler l'état des champs remplis *à cette étape* |
| Cardinalité | 1 par document | 1 par Approval Signature |

### Usage dans ce projet

Chaque signataire appose une Approval Signature avec un FieldMDP configuré en `Exclude` sur ses propres champs : une fois signée, sa contribution est gelée et ne peut plus être altérée par les signataires suivants. Le DocMDP de niveau `P=2` posé à la création du workflow reste la garde-fou global, garantissant qu'aucune modification structurelle n'est possible quelle que soit l'étape.

```
Workflow :
  ┌─────────────────────────────────────────────────────┐
  │ Certification Signature (DocMDP P=2)                │  ← création du workflow
  │   → autorise : remplissage champs + nouvelles sigs  │
  └─────────────────────────────────────────────────────┘
           ↓
  ┌─────────────────────────────────────────────────────┐
  │ Approval Signature Signataire 1 (FieldMDP Exclude)  │  ← étape 1
  │   → gèle : tous les champs sauf ceux de S1          │
  └─────────────────────────────────────────────────────┘
           ↓
  ┌─────────────────────────────────────────────────────┐
  │ Approval Signature Signataire 2 (FieldMDP Exclude)  │  ← étape 2
  │   → gèle : tous les champs sauf ceux de S2          │
  └─────────────────────────────────────────────────────┘
```

---

## Sources de référence



- **Adobe — Digital Signatures in a PDF** (document technique gratuit, très lisible) :
  https://www.adobe.com/devnet-docs/acrobatetk/tools/DigSigDC/Acrobat_DigitalSignatures_in_PDF.pdf

- **Javadoc `SigUtils`** (PDFBox 2.0.x) :
  https://pdfbox.apache.org/docs/2.0.13/javadocs/org/apache/pdfbox/examples/signature/SigUtils.html

- **iText — Attacks on PDF certification** — analyse détaillée des niveaux DocMDP et de leurs implications sécurité :
  https://itextpdf.com/blog/itext-news-technical-notes/attacks-pdf-certification-and-what-you-can-do-about-them