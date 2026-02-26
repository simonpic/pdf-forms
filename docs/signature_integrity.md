# Validité Signature PDF — Guide technique

---

## 1. Structure d'une signature dans le PDF

Une signature PDF est composée de **deux objets distincts** qui n'ont pas le même rôle :

```
AcroForm
└── PDSignatureField          ← champ de formulaire (contient la géométrie)
    ├── /V → Signature dict   ← la SIGNATURE cryptographique (PKCS#7)
    │         ├── /ByteRange  [0, offset, offset+len, fin]
    │         ├── /Contents   <...bytes PKCS#7...>
    │         ├── /Filter     /Adobe.PPKLite
    │         └── /SubFilter  /adbe.pkcs7.detached
    │
    └── Widget annotation     ← l'APPARENCE visuelle (ce que voit l'utilisateur)
              └── /AP
                  └── /N → Appearance Stream  (fond bleu, nom, date…)
```

**Point clé** : `/V` (la signature cryptographique) et `/AP` (l'apparence) sont **deux objets COS indépendants**. Modifier l'un n'affecte pas l'intégrité de l'autre — à condition de respecter le modèle incrémental PDF.

---

## 2. Le ByteRange et ce qu'il protège

Le vérificateur de signature calcule un hash SHA-256 sur les octets du fichier **couverts par le ByteRange** :

```
Fichier PDF (octets)
┌──────────┬─────────────────┬──────────────────────────────┐
│ Part A   │   /Contents     │          Part B              │
│ 0..off   │  (PKCS#7 blob)  │  off+len .. fin              │
└──────────┴─────────────────┴──────────────────────────────┘
     ↑_______________hash SHA-256 sur Part A + Part B___________↑
                (le blob /Contents lui-même est EXCLU du hash)
```

`/ByteRange [0  offset  offset+len  tailleTotal]`

Le blob `/Contents` est **exclu du calcul** — il est le résultat, pas l'entrée. Tout le reste du fichier est couvert.

---

## 3. ByteRange vs Permissions : deux garanties orthogonales

**Le ByteRange** répond à : *"Le contenu a-t-il été modifié depuis la signature ?"*
**Les permissions DocMDP** répondent à : *"Ce type de modification est-il autorisé ?"*

Un viewer PDF (Acrobat, Foxit…) fait les **deux vérifications séparément** :

```
Vérification d'une signature
        │
        ├─ 1. Intégrité cryptographique
        │      Hash(Part A + Part B) == hash dans /Contents ?
        │      → OUI : la signature est techniquement VALIDE
        │
        └─ 2. Conformité aux permissions (seulement pour DocMDP)
               Les révisions postérieures respectent-elles P=1/2/3 ?
               → NON : la signature est marquée INVALIDE malgré le hash correct
```

Un save incrémental ne casse jamais le hash — mais il peut **violer les permissions**, ce qui fait passer la signature de "valide" à "invalide" dans le viewer.


## 4. Sauvegardes incrémentielles — pourquoi l'apparence n'invalide pas

PDF supporte les **révisions incrémentielles** : on n'écrase jamais un octet existant, on **ajoute** à la fin du fichier.

```
┌─────────────────────────────────┐  ← Révision 1 : signature de certification
│  %PDF-1.7                       │    ByteRange couvre [0 .. fin R1]
│  ... objets originaux ...       │
│  xref / trailer (R1)            │
├─────────────────────────────────┤  ← Révision 2 : signature d'approbation
│  ... nouveaux objets ...        │    ByteRange couvre [0 .. fin R2]
│  xref / trailer (R2)            │    (inclut donc tout R1 → R1 reste valide)
├─────────────────────────────────┤  ← Révision 3 : apparence (AP stream)
│  Appearance Stream (fond bleu,  │    Ajout pur — aucun octet existant modifié
│  nom, date…)                    │    R2 est toujours intègre car son ByteRange
│  xref / trailer (R3)            │    ne couvre pas R3
└─────────────────────────────────┘
```

**Règle d'or** : une signature couvre tout ce qui précède elle dans le fichier, mais **jamais ce qui vient après**. Les révisions ultérieures sont donc hors de portée de son ByteRange → elles ne peuvent pas l'invalider.

### Ce que DocMDP/FieldMDP autorise ou interdit

| Permission | Autorisé après signature |
|---|---|
| DocMDP P=2 (certification) | Remplir des champs AcroForm, ajouter des annotations de commentaire |
| FieldMDP (approbation) | Modifications des champs *non listés* dans `/Fields` |
| Toute signature | Ajouter des révisions incrémentielles respectant les permissions |

L'apparence (`/AP`) est traitée par Adobe Acrobat comme une **annotation** mise à jour — autorisée par DocMDP P=2.

---


## 5. Comment PDFBox construit l'apparence dans ce projet

Le flux d'exécution lors d'un `fillAndSign` :

```
signPdf()
  ├── applyFieldValues()          ← remplit les champs AcroForm
  ├── doc.addSignature()          ← PDFBox réserve /Contents + /ByteRange
  ├── applySignatureAppearance()  ← positionne le widget sur la page cible
  │     └── buildSignatureAppearance()
  │           ├── PDDocument tempDoc    (document temporaire)
  │           ├── PDPageContentStream   (dessine fond, barre, textes)
  │           ├── copie contentBytes → PDAppearanceStream du doc principal
  │           └── widget.setAppearance(appearanceDict)
  └── doc.saveIncremental()       ← écrit UNE SEULE révision couvrant tout
```


## 6. `NeedAppearances = false` avant `saveIncremental`

`NeedAppearances = true` signale aux viewers PDF qu'ils doivent **regénérer** les apparences des champs depuis leurs valeurs. Si ce flag est `true` au moment de signer, un viewer pourrait regénérer les AP et modifier des octets couverts par le ByteRange → **signature invalide**.

PDFBox génère les streams `/AP` immédiatement à chaque `setValue()`, indépendamment du flag. On positionne donc `NeedAppearances = false` juste avant `saveIncremental()` : les apparences sont déjà là, le viewer n'a rien à regénérer.

```java
acroForm.setNeedAppearances(false);  // ← critique, juste avant saveIncremental
doc.saveIncremental(bos);
```
