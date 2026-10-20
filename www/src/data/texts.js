// Paket B – Alle Texte der Oberfläche an einem Ort, damit der Ton überall gleich klingt (docs/STIL.md):
// Duzen, Werkstatt-Humor, kurze Sätze. Erzähler ist Opa Gerd, Werkstattmeister – er schreibt kurze Notizzettel.
// Reine Daten (kein DOM). Texte mit Werten sind Funktionen. Kleine Zufallsauswahl über pickLine(liste, seed) –
// deterministisch, damit derselbe Bildschirm beim Neuzeichnen nicht den Spruch wechselt.

export const NARRATOR = 'Opa Gerd';

// Deterministische Auswahl aus einer Liste (seed: Zahl oder Text)
export function pickLine(list, seed = 0) {
  if (!list || !list.length) return '';
  let h = 7;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export const TXT = {
  boot: { sub: 'Opa Gerd schließt die Werkstatt auf …' },

  garage: {
    title: { garage: 'GARAGE', paint: 'LACKIEREREI', stats: 'FAHRTENBUCH' },
    tabs: { garage: 'Garage', lab: 'Labor', paint: 'Lack', stats: 'Statistik' },
    start: 'AB AUF DEN PLATZ',
    resume: 'RUN FORTSETZEN',
    locked: 'KISTE GESPERRT',
    giveUp: 'Aufgeben',
    parts: 'Teile',
    abilities: 'Fähigkeiten',
    runOn: 'Run läuft:',
    runFixed: 'Die Ausrüstung ist ab dem Start fest – Umbauten gelten ab dem nächsten Run.',
    emptySlot: 'leer',
    noRuns: 'Noch keine Runs – ab in die Kiste!',
    paintHint: (kbd) => `Rein optisch – gilt für alle Chassis. ${kbd ? 'Auswählen (Enter)' : 'Antippen'} = Probelackieren am Modell.`,
  },

  lab: {
    title: 'Erfinder-Labor',
    hint: (kbd) => `${kbd ? 'Wähle einen Knoten (Tab/Pfeiltasten, Enter).' : 'Tipp einen Knoten an.'} Blaupausen gibt’s für Elite-Etappen, Bosse und manche Ereignisse.`,
    research: 'Erforschen',
    needs: 'Braucht:',
    locked: 'Erst die Voraussetzungen erforschen',
  },

  map: {
    choose: 'Such dir einen Weg aus.',
    running: 'Knoten läuft – weiter geht’s!',
    floorDone: (n) => `Etage ${n} geschafft – wohin jetzt?`,
    notReach: 'Da kommst du noch nicht hin – folg den Linien.',
    visited: 'Da warst du schon.',
    bossWarn: 'HIER NICHT LANG!',
    start: 'Start',
  },

  hud: {
    knapp: (p) => `Knapp: ${p} %`,
    overheat: 'ÜBERHITZT',
    tapEnd: 'Tippen = Ende',
    keyEnd: 'Leertaste = Ende',
    chain: (n) => `KETTENREAKTION ×${n}!`,
  },

  // Etappen-Ergebnis: Überschriften (gestempelt) und Opa Gerds Kommentar
  result: {
    cleared: 'SAUBER GELANDET!',
    platin: 'PLATIN – WAHNSINN!',
    king: 'SCHROTTKÖNIG!',
    boss: 'BOSS VERSCHROTTET!',
    missed: 'KNAPP DANEBEN – ABER DIE KISTE LEBT.',
    missedFall: 'ABGESTÜRZT – ABER DIE KISTE LEBT.',
    wreck: 'TOTALSCHADEN.',
    over: 'FEIERABEND.',
    fail: 'DA FEHLT NOCH WAS.',
    fallFail: 'AB IN DIE SCHLUCHT.',
    why: { stop: 'ausgerollt', fall: 'in die Schlucht gestürzt', time: 'Zeit abgelaufen', wreck: 'Totalschaden', far: 'Ziel weit übertroffen' },
    quips: {
      good: ['Sauber! So hab ich das früher auch gemacht.', 'Siehste – Klebeband hält alles.', 'Da staunt der Schrotthändler.', 'Nicht schlecht für ’ne Kiste aus Altmetall.'],
      top: ['Das hängen wir in der Werkstatt an die Wand!', 'Mir fällt der Kaffee aus der Hand.', 'So weit flog nicht mal mein Moped.'],
      miss: ['Knapp ist auch daneben. Aber nur knapp.', 'Noch ’ne Schraube nachziehen, dann klappt das.', 'Halb so wild – die Kiste lebt.'],
      bad: ['Kopf hoch. Schrott gibt’s genug.', 'Das war ein Testlauf. Sagen wir einfach so.', 'Ich hol schon mal den Abschleppwagen.'],
    },
    loot: {
      stage: 'FUNDSTÜCK! Eins darfst du einpacken.',
      elite: 'ELITE-BEUTE – mindestens selten.',
      boss: 'BOSS-BEUTE – episch oder legendär.',
      crate: 'KISTE GEKNACKT – such dir was aus.',
      event: 'FUNDSTÜCK',
      treasure: 'SCHATZ',
    },
    lootSub: {
      elite: 'Mindestens selten.',
      boss: 'Episch oder legendär.',
      crate: 'Aus der Kiste in der Strecke.',
      event: 'Rucksack voll – ersetzen oder ablehnen.',
      treasure: 'Rucksack voll – ersetzen oder liegen lassen.',
      stage: 'Eins darfst du einpacken.',
    },
    poolEmpty: 'Der Pool ist leer – nimm die Schrauben.',
    more: (n) => `noch ${n} weitere Auswahl`,
    full: 'voll – Einpacken ersetzt ein Item',
    take: 'Einpacken',
    skip: (n) => (n ? `Liegen lassen: +${n}` : 'Liegen lassen'),
    next: 'Weiter',
    retry: 'Nochmal',
    retryTow: 'Neuversuch',
    land: 'Notlanden',
    map: 'Karte',
    end: 'Run beenden',
  },

  // Run-Ende
  end: {
    win: 'MEISTERSTÜCK!',
    lose: 'FEIERABEND.',
    reason: {
      win: 'Alle drei Akte geschafft – die Kiste hat gehalten!',
      wreck: 'Totalschaden – die Kiste ist hinüber.',
      tow: 'Der Abschleppdienst hat das letzte Stück Haltbarkeit gefressen.',
      emergency: 'Die letzte Notlandung war eine zu viel.',
      giveup: 'Run aufgegeben. Auch mal gut.',
    },
    quipWin: 'Ich wusste, dass in dir ein Schrauber steckt. – Opa Gerd',
    quipLose: 'Morgen bauen wir sie besser wieder auf. – Opa Gerd',
    payout: 'Ab in die Garage damit',
    garage: 'Ab in die Garage',
  },

  act: {
    done: (n) => `AKT ${n} ERLEDIGT.`,
    title: (n) => `AKT ${n}`,
    go: 'Zur Karte',
  },

  // Sonderknoten: Ladenschilder und Untertitel
  shop: {
    dealer: { sign: 'KALLES SCHROTT & SÖHNE', sub: 'Fünf Fundstücke und eine Fähigkeit – alles mit Rost-Garantie.' },
    workbench: { sign: 'OPAS WERKBANK', sub: 'Schraubstock, Kaffeefleck, ein Bleistift.' },
    blackmarket: { sign: 'SCHWARZMARKT', sub: 'Bezahlt wird nicht mit Schrauben. Bezahlt wird mit dir.' },
    station: { sign: 'TANKE', sub: (hp, max) => `Eine Wahl für den Rest des Runs. Haltbarkeit: ${hp} / ${max}` },
    treasure: { sign: 'SCHROTTHAUFEN', sub: 'Ein Haufen Schrott – und darin glänzt etwas.' },
    event: { sign: 'MERKWÜRDIG …' },
    buy: 'Kaufen',
    sold: 'Gekauft',
    reserve: 'Zurücklegen',
    reserved: 'Für den nächsten Händler zurückgelegt',
    unreserve: 'Lösen',
    reroll: 'Neu würfeln',
    leave: 'Weiter',
    ability: 'Fähigkeit',
    noAbility: 'Heute keine Fähigkeit im Angebot.',
    abilityNote: 'Ersetzt einen deiner Fähigkeits-Slots bis zum Run-Ende.',
    reserveNote: 'Zurückgelegt für den nächsten Händler:',
    // Werkbank
    fuseHead: 'Schraubstock (1 je Besuch)',
    fuseTier: 'Verschmelzen',
    fuseHybrid: 'Hybrid bauen',
    fusePair: 'Zwei gleiche gefunden!',
    fuseNone: 'Keine Fusion möglich: ★+1 braucht 2 gleiche Items mit gleicher ★, ein Hybrid 2 Items mit verschiedenen Tags.',
    fusePick: 'Tipp ein Teil an, dann siehst du, was draus wird.',
    fuseWith: 'passt zu',
    hybridNote: 'beide Tags, Effekte ×0,75, 1 Platz wird frei',
    scrapHead: 'Zerlegen (unbegrenzt)',
    scrap: 'Zerlegen',
    emptyBag: 'Der Rucksack ist leer.',
    // Schwarzmarkt
    trunkEmpty: 'Der Kofferraum ist leer.',
    curseHead: 'Fluch entfernen',
    curseNone: 'Keine verfluchten Items im Rucksack.',
    uncurse: 'Fluch entfernen',
    // Schatz
    suspicious: 'Verdächtig!',
    harmless: 'Sieht harmlos aus.',
    nothing: 'Nur Rost und ein alter Kronkorken.',
    take: 'Einpacken',
    leaveIt: 'Liegen lassen',
    // Ereignis
    cost: 'Kosten:',
    notPossible: { bolts: 'Nicht genug Schrauben', hp: 'Zu wenig Haltbarkeit', fuel: 'Zu wenig Treibstoff', item: 'Kein Fundstück dabei' },
    pendingUp: 'Wähl ein Fundstück, das eine Stufe aufsteigt.',
    pendingDrop: 'Wähl ein Fundstück, das du abgibst.',
    pendingBtn: 'Fundstück wählen',
    toElite: 'Zur Elite-Etappe',
    back: 'Zurück',
    otherChoice: 'Andere Wahl',
    replace: 'Ersetzen',
    bagFull: 'RUCKSACK VOLL',
    makeRoom: (name) => `Welches Item soll <b>${name}</b> Platz machen?`,
  },

  pause: {
    title: 'KAFFEEPAUSE',
    resume: 'Weiter',
    settings: 'Einstellungen',
    keys: 'Tastenbelegung',
    quitRun: 'Run aufgeben',
    quitTest: 'Testfahrt beenden',
    keyLine: 'Esc / P / Enter = weiter · K = Tastenbelegung',
  },

  settings: {
    title: 'SCHALTKASTEN',
    done: 'Fertig',
  },

  dialog: {
    yes: 'Ja',
    cancel: 'Abbrechen',
    ok: 'Alles klar',
    exitGame: 'Feierabend machen? Dein Fortschritt ist gespeichert.',
    exitYes: 'Beenden',
    leaveShop: 'Laden verlassen und weiter zur Karte?',
    leaveShopYes: 'Verlassen',
    leaveTreasure: 'Den Schatz liegen lassen und weiter?',
    leaveTreasureYes: 'Liegen lassen',
    giveUp: 'Run wirklich aufgeben? Gesammelter Schrott und Blaupausen werden trotzdem ausgezahlt.',
    giveUpYes: 'Aufgeben',
  },

  tutorial: {
    ok: 'Verstanden',
    off: 'Alle Hinweise aus',
    tapClose: 'antippen zum Schließen',
    keyClose: 'verschwindet von selbst · Esc schließt',
    sign: `– ${'Opa Gerd'}`,
  },

  hints: {
    choice: 'Pack eins ein – oder lass es liegen.',
    shop: 'Erst entscheiden, dann weiter.',
  },
};
