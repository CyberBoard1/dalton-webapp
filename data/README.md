Ce dossier peut contenir un cache local des données Dalton.

Pour remplir le cache sur un VPS connecté à Internet :

```bash
bash scripts/sync-dalton-data.sh
```

L'application essaie d'abord de lire `public/data/dalton.csv`, puis bascule vers le CSV officiel du dépôt GitHub ANSSI-FR/dalton si le cache local est absent.
