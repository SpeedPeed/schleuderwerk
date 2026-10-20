// Erzeugt von tools/sim/levelGains.mjs (2026-10-20, 24 Etappen je Messpunkt) – nicht von Hand ändern.
// Meter je effektiver Slot-Stufe (items/statMods.js → partDimLevels) auf der Bezugs-Etappe, gemessen mit dem Etappen-Bot
// (alle anderen Slots: Startteile auf Stufe 0). Die Garage zeigt damit an jedem Verbessern-Knopf „+N m“
// (garage/garage.js → levelGain). 0 = kein messbarer Weitengewinn (z. B. Panzerung: die Garage zeigt dann den Wert).
export const LEVEL_GAINS = {
  ref: "Etage 4 in Akt 1",
  parts: {
    drive_rasenmaehermotor: 5.56,
    drive_pedale: 20.64,
    drive_elektromotor: 14.08,
    drive_staubsaugerturbine: 2.22,
    wheels_bobbycar: 0.43,
    wheels_traktorreifen: 0,
    wheels_gummibaelle: 0.37,
    wheels_kugellager: 0,
    aero_fahrtwind: 0.14,
    aero_regenschirm: 0.08,
    aero_buegelbrett: 0.01,
    aero_heckspoiler: 1.15,
    armor_pappe: 0,
    armor_topfdeckel: 0,
    armor_matratze: 0,
    armor_oelfass: 0,
    tank_kanister: 2.46,
    tank_thermoskanne: 2.58,
    tank_gurkenfass: 3.51,
    tank_gasflasche: 0,
    cooling_fahrtwind: 0,
    cooling_ventilator: 0,
    cooling_heizluefter: 1.24,
    cooling_autokuehler: 0,
    cooling_trockeneis: 0,
    gadget_hupe: 0,
    gadget_magnet: 0.52,
    gadget_kompass: 0,
    gadget_schneeschaufel: 0,
    gadget_gluecksbringer: 0,
  },
};
