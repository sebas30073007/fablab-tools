// alarmas.js - códigos de GRBL 1.1 en español, con lo que hay que hacer.
// accion: "desbloquear" ($X) · "homing" ($H) · null (solo leer)

export const ALARMAS = {
  1: { t: "Final de carrera tocado", d: "Un eje llegó al interruptor de límite. La posición ya no es confiable.", accion: "homing",
       pasos: ["Desbloquea", "Aleja el eje del extremo con el jog", "Haz homing antes de volver a trabajar"] },
  2: { t: "Movimiento fuera del área", d: "El programa pidió ir más allá del recorrido de la máquina. No se movió nada.", accion: "desbloquear",
       pasos: ["Revisa que el cero de trabajo (X0 Y0) esté donde crees", "Revisa que la pieza quepa en el área"] },
  3: { t: "Reset con la máquina en movimiento", d: "Se reinició mientras los ejes se movían; pudieron perderse pasos.", accion: "homing",
       pasos: ["Haz homing para recuperar la posición", "Verifica el cero de trabajo antes de seguir"] },
  4: { t: "Sonda ya en contacto", d: "La sonda marcaba contacto antes de empezar a bajar.", accion: "desbloquear",
       pasos: ["Revisa que la fresa no toque la placa", "Revisa que el caimán no esté tocando la placa ni el cable de la sonda"] },
  5: { t: "La sonda no tocó", d: "La fresa bajó toda la distancia permitida y no hubo contacto.", accion: "desbloquear",
       pasos: ["Comprueba el caimán en la fresa y el cable en la placa", "Acerca la fresa a la placa (unos 5 mm) y repite", "Si la placa tiene barniz u óxido, lija un punto"] },
  6: { t: "Homing interrumpido", d: "Se pausó, reinició o abrió la puerta durante el homing.", accion: "homing", pasos: ["Repite el homing"] },
  7: { t: "Homing: puerta abierta", d: "Se abrió la puerta de seguridad durante el homing.", accion: "homing", pasos: ["Cierra la puerta y repite"] },
  8: { t: "Homing: no soltó el límite", d: "Al retroceder no se liberó el interruptor.", accion: "homing",
       pasos: ["Revisa que nada empuje el eje contra el límite", "Repite el homing"] },
  9: { t: "Homing: no encontró el límite", d: "El eje recorrió todo y no tocó el interruptor. A veces es un ruido raro del motor o algo que lo frena.", accion: "homing",
       pasos: ["Apaga la máquina y mueve el eje a mano: debe correr libre", "Revisa el cable del interruptor", "Repite el homing"] },
  10: { t: "Homing: límite en el lado equivocado", d: "Se activó otro interruptor durante el homing.", accion: "homing", pasos: ["Revisa el cableado de los límites"] },
};

export const ERRORES = {
  1: "Letra de G-code no reconocida", 2: "Falta el número después de una letra", 3: "Comando $ no reconocido",
  4: "Valor negativo no permitido", 5: "Homing no está habilitado", 6: "Pulso de paso demasiado corto",
  7: "Error al leer la EEPROM", 8: "Comando $ solo cuando la máquina está quieta",
  9: "Bloqueado: hay una alarma. Desbloquea o haz homing primero", 10: "Límites por software requieren homing",
  11: "Línea demasiado larga", 12: "Ajuste fuera de rango", 13: "Puerta de seguridad abierta",
  14: "Línea de inicio demasiado larga", 15: "El jog se saldría del área de trabajo", 16: "Comando de jog inválido",
  17: "Modo láser requiere salida PWM", 20: "Comando G-code no soportado", 21: "Dos comandos del mismo grupo en una línea",
  22: "Falta la velocidad de avance (F)", 23: "Se esperaba un número entero", 24: "Dos comandos usan los mismos ejes",
  25: "Letra repetida en la línea", 26: "Falta el eje en el comando", 27: "Número de línea inválido",
  28: "Faltan valores en el comando", 29: "G59.x no soportado", 30: "G53 solo con G0 o G1",
  31: "Sobran palabras de eje", 32: "G2/G3 necesita al menos un eje del plano", 33: "Destino del movimiento inválido",
  34: "Radio del arco inválido", 35: "G2/G3 necesita centro o radio", 36: "Sobran valores",
  37: "Compensación de herramienta: eje inválido", 38: "Número de herramienta demasiado grande",
};

export const ESTADOS = {
  Idle: "Quieta", Run: "Trabajando", Hold: "En pausa", Jog: "Moviendo", Alarm: "Alarma",
  Door: "Puerta abierta", Check: "Revisión", Home: "Homing", Sleep: "Dormida", Desconectado: "Desconectada",
};
