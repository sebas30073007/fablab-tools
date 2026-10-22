// alarmas.js - códigos de GRBL 1.1 en español, con lo que hay que hacer.
// accion: "desbloquear" ($X) · "homing" ($H) · null (solo leer)

export const ALARMAS = {
  1: { t: "Limit switch hit", d: "The beep: an axis reached the end switch. The position can’t be trusted anymore.", accion: "desbloquear",
       pasos: ["Unlock", "Move the axis away from the end in 1 mm steps", "Run homing before working again"] },
  2: { t: "Move outside the work area", d: "A move asked to go past the machine’s travel. Nothing moved.", accion: "desbloquear",
       pasos: ["Check that the work zero (X0 Y0) is where you think", "Check that the part fits in the area"] },
  3: { t: "Reset while the machine was moving", d: "It was reset while the axes were moving; steps may have been lost.", accion: "homing",
       pasos: ["Run homing to recover the position", "Check the work zero before continuing"] },
  4: { t: "Probe already touching", d: "The probe showed contact before it started going down.", accion: "desbloquear",
       pasos: ["Check that the bit isn’t touching the board", "Check that the alligator clip isn’t touching the board or the probe wire"] },
  5: { t: "The probe didn’t touch", d: "The bit went down the full allowed distance with no contact.", accion: "desbloquear",
       pasos: ["Check the alligator clip on the bit and the wire on the board", "Bring the bit closer to the board (about 5 mm) and try again", "If the board has varnish or oxide, sand a spot"] },
  6: { t: "Homing interrupted", d: "It was paused, reset, or the door was opened during homing.", accion: "homing", pasos: ["Run homing again"] },
  7: { t: "Homing: door open", d: "The safety door was opened during homing.", accion: "homing", pasos: ["Close the door and try again"] },
  8: { t: "Homing: limit switch did not release", d: "The switch didn’t release when backing off.", accion: "homing",
       pasos: ["Check that nothing pushes the axis against the limit", "Run homing again"] },
  9: { t: "Homing: limit switch not found", d: "The axis traveled all the way and didn’t touch the switch. Sometimes it’s an odd motor noise or something holding it back.", accion: "homing",
       pasos: ["Turn off the machine and move the axis by hand: it should run freely", "Check the switch cable", "Run homing again"] },
  10: { t: "Homing: limit on the wrong side", d: "Another switch triggered during homing.", accion: "homing", pasos: ["Check the limit switch wiring"] },
};

export const ERRORES = {
  1: "Unrecognized G-code letter", 2: "Missing number after a letter", 3: "Unrecognized $ command",
  4: "Negative value not allowed", 5: "Homing is not enabled", 6: "Step pulse too short",
  7: "EEPROM read error", 8: "$ command only while the machine is idle",
  9: "Locked: there is an alarm. Unlock or home first", 10: "Soft limits require homing",
  11: "Line too long", 12: "Setting out of range", 13: "Safety door open",
  14: "Startup line too long", 15: "The jog would leave the work area", 16: "Invalid jog command",
  17: "Laser mode requires PWM output", 20: "Unsupported G-code command", 21: "Two commands from the same group on one line",
  22: "Missing feed rate (F)", 23: "An integer was expected", 24: "Two commands use the same axes",
  25: "Repeated letter on the line", 26: "Missing axis in the command", 27: "Invalid line number",
  28: "Missing values in the command", 29: "G59.x not supported", 30: "G53 only with G0 or G1",
  31: "Too many axis words", 32: "G2/G3 needs at least one axis in the plane", 33: "Invalid move target",
  34: "Invalid arc radius", 35: "G2/G3 needs a center or a radius", 36: "Too many values",
  37: "Tool offset: invalid axis", 38: "Tool number too large",
};

export const ESTADOS = {
  Idle: "Idle", Run: "Running", Hold: "Paused", Jog: "Jogging", Alarm: "Alarm",
  Door: "Door open", Check: "Check mode", Home: "Homing", Sleep: "Sleeping", Desconectado: "Disconnected",
};
