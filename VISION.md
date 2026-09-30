# First AI — Vision produit

## 1. Mission

First AI est le système d’exploitation intelligent de l’entreprise.

Son objectif est de centraliser et automatiser :
- la relation client ;
- la prospection ;
- les devis ;
- les interventions ;
- la planification ;
- la finance ;
- la pré-comptabilité ;
- le suivi fiscal et administratif ;
- la gestion des stocks ;
- la qualité ;
- le marketing ;
- les ressources humaines ;
- la conformité ;
- l’analyse de rentabilité.

First AI doit permettre à une petite équipe humaine de piloter une entreprise avec un niveau d’organisation comparable à une structure beaucoup plus grande.

---

## 2. Interface principale

L’interface principale de First AI est conversationnelle.

L’utilisateur doit pouvoir piloter l’entreprise principalement par :

- chat texte ;
- commandes vocales ;
- réponses vocales ;
- notifications ;
- dashboard synthétique.

L’utilisateur ne doit pas être obligé de naviguer dans de nombreux écrans pour accomplir des tâches courantes.

Exemples :

> Fais-moi le point sur la journée.

> Quels devis doivent être relancés ?

> Pourquoi notre marge a baissé ce mois-ci ?

> Planifie les interventions de demain.

> Combien peut-on investir sans mettre la trésorerie en danger ?

> Termine le compte rendu de l’intervention Dupont et programme le contrôle dans 14 jours.

---

## 3. Directeur IA

L’utilisateur dispose d’un interlocuteur principal appelé :

**Directeur IA**

Le Directeur IA :
- comprend les demandes ;
- décompose les objectifs complexes ;
- choisit les agents spécialisés nécessaires ;
- appelle les outils ;
- récupère les données ;
- contrôle les résultats ;
- cherche les informations manquantes ;
- détecte les incohérences ;
- décide s’il doit poursuivre son travail ;
- demande une validation humaine lorsqu’une action est sensible ;
- produit une réponse synthétique pour l’utilisateur.

L’utilisateur ne doit pas avoir à déterminer lui-même quel agent utiliser.

---

## 4. Architecture multi-agents

First AI contient 18 agents.

### Direction
1. Directeur IA

### Commercial
2. Agent Prospection
3. Agent Qualification
4. Agent Commercial
5. Agent Devis / Pricing

### Opérations
6. Agent Planning
7. Agent Technicien
8. Agent Qualité / SAV
9. Agent Stock / Achats

### Finance
10. Agent DAF
11. Agent Comptabilité / Pré-comptabilité
12. Agent Fiscal / Administratif
13. Agent Contrôle de gestion
14. Agent Recouvrement

### Croissance
15. Agent Marketing
16. Agent Réputation / Avis
17. Agent Appels d’offres / Grands comptes

### Organisation
18. Agent RH / Conformité

Chaque agent possède :
- une mission clairement définie ;
- des outils autorisés ;
- des outils interdits ;
- un niveau d’autonomie ;
- un périmètre mémoire ;
- un budget d’exécution ;
- des limites de sécurité.

---

## 5. Principe d’autonomie

First AI ne doit pas se limiter au modèle :

question → réponse.

Il doit pouvoir travailler en boucle :

1. Observer
2. Comprendre
3. Planifier
4. Agir
5. Observer le résultat
6. Critiquer le résultat
7. Identifier les informations manquantes
8. Continuer si nécessaire
9. Terminer ou demander une intervention humaine

Toute boucle autonome possède des limites :
- nombre maximal d’itérations ;
- nombre maximal d’appels outils ;
- durée maximale ;
- budget maximal ;
- règles d’arrêt ;
- journalisation complète.

Aucune boucle ne doit pouvoir fonctionner sans limite.

---

## 6. Apprentissage

First AI doit apprendre à partir de l’activité de l’entreprise.

L’apprentissage ne consiste pas à laisser l’IA modifier librement son code ou ses instructions de production.

Le système apprend via :
- l’historique des interventions ;
- les marges réalisées ;
- les devis acceptés ou refusés ;
- les temps réellement passés ;
- les retours clients ;
- les reprises SAV ;
- les erreurs des agents ;
- les corrections humaines ;
- les décisions du dirigeant ;
- les résultats commerciaux ;
- les coûts produits ;
- les performances des campagnes marketing.

Le système doit progressivement améliorer :
- ses estimations ;
- ses recommandations ;
- ses prévisions ;
- ses priorités ;
- son pricing ;
- son organisation.

Les changements importants de comportement doivent être testés avant activation.

---

## 7. Mémoire

First AI dispose de plusieurs types de mémoire.

### Mémoire métier
Informations factuelles liées à l’entreprise.

Exemple :
- préférences d’un client ;
- horaires d’accès à un site ;
- contraintes contractuelles.

### Mémoire stratégique
Objectifs de l’entreprise.

Exemple :
- marge opérationnelle cible ;
- trésorerie minimale ;
- zones géographiques prioritaires.

### Mémoire d’expérience
Résultats historiques.

Exemple :
- durée moyenne d’un traitement ;
- quantité moyenne de produit ;
- taux de reprise ;
- marge par type d’intervention.

### Mémoire agentique
Historique des missions IA :
- objectif ;
- plan ;
- outils utilisés ;
- erreurs ;
- résultat ;
- feedback utilisateur.

---

## 8. Source de vérité

Les agents ne doivent jamais inventer des données métier.

Les informations opérationnelles doivent provenir de sources structurées :
- PostgreSQL ;
- Qonto ;
- documents ;
- outils métier ;
- services externes autorisés.

La base PostgreSQL constitue la source de vérité principale de l’application.

---

## 9. Outils

Les agents n’accèdent pas directement aux systèmes internes.

Ils utilisent une couche d’outils contrôlés.

Exemples :

- searchCustomers
- getCustomer
- createQuote
- getOpenQuotes
- getTodayJobs
- scheduleJob
- getBankBalance
- getBankTransactions
- getUnpaidInvoices
- calculateMargin
- getInventory
- sendEmail
- createTask
- searchKnowledge

Chaque appel d’outil doit pouvoir être :
- authentifié ;
- autorisé ;
- validé ;
- journalisé ;
- audité.

---

## 10. Sécurité

First AI doit appliquer le principe du moindre privilège.

Les actions sont séparées en quatre niveaux.

### Niveau A0 — Lecture
Analyse et consultation uniquement.

### Niveau A1 — Recommandation
L’IA propose une action mais ne l’exécute pas.

### Niveau A2 — Action faible risque
L’IA peut exécuter automatiquement certaines actions définies.

Exemples :
- créer une tâche ;
- envoyer une relance standard ;
- préparer un devis ;
- déplacer une tâche non critique.

### Niveau A3 — Action sensible
Validation humaine obligatoire.

Exemples :
- virement ;
- paiement ;
- signature de contrat ;
- embauche ;
- licenciement ;
- emprunt ;
- grosse remise ;
- modification fiscale ;
- commande importante.

---

## 11. Finance

La première intégration bancaire cible est Qonto.

Dans les premières versions :
- accès lecture seule ;
- récupération des soldes ;
- transactions ;
- encaissements ;
- dépenses ;
- rapprochement avec factures.

First AI ne doit pas pouvoir effectuer de virement bancaire de manière autonome.

Les fonctions de pré-comptabilité assistent l’entreprise mais ne remplacent pas la validation d’un professionnel lorsque celle-ci est nécessaire.

---

## 12. Utilisation mobile

First AI est une application web responsive installable en PWA.

Objectifs :
- aucune dépendance aux stores mobiles ;
- utilisation depuis ordinateur ;
- utilisation depuis smartphone ;
- interface tactile ;
- vocal adapté au terrain ;
- fonctionnement rapide avec connexion mobile.

---

## 13. Expérience utilisateur

First AI doit rester simple malgré sa complexité interne.

Écrans principaux :

1. Chat First AI
2. Dashboard
3. Clients / CRM
4. Interventions
5. Commercial
6. Finance
7. Stocks
8. Documents
9. Agents / automatisations
10. Administration

Le chat reste l’interface prioritaire.

---

## 14. Observabilité

Chaque exécution agentique doit être traçable.

Une exécution doit pouvoir afficher :
- agent ;
- objectif ;
- utilisateur déclencheur ;
- étapes ;
- outils utilisés ;
- données consultées ;
- décisions ;
- durée ;
- coût IA ;
- statut final ;
- erreurs ;
- validations humaines.

---

## 15. Objectif économique

First AI doit augmenter la productivité de l’entreprise.

Le logiciel doit contribuer à :
- augmenter le chiffre d’affaires par salarié ;
- réduire le temps administratif ;
- améliorer le taux de conversion ;
- réduire les impayés ;
- réduire les déplacements inutiles ;
- améliorer la marge ;
- réduire les erreurs ;
- augmenter la récurrence client ;
- détecter plus rapidement les problèmes.

---

## 16. Philosophie produit

First AI doit être :

- AI-first ;
- conversationnel ;
- modulaire ;
- traçable ;
- sécurisé ;
- testable ;
- évolutif ;
- orienté données ;
- orienté rentabilité ;
- utilisable par une petite équipe.

La complexité doit être dans le système, pas dans l’expérience utilisateur.

---

## 17. Principe fondamental

First AI n’est pas un chatbot ajouté à un CRM.

First AI est un système d’entreprise dans lequel l’intelligence artificielle constitue la couche principale d’orchestration.

Les écrans traditionnels servent à consulter, contrôler et corriger.

Le Directeur IA sert à piloter.