// Pruebas de lógica pura (no requieren emulador): node --test tests/logic.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  generarNameKey, validarNombre, validarPadron, contarVotos, lideres,
  siguienteCargo, esperaCreciente, aCSV, validarDirectivas, validarCandidatos, iniciales,
} from "../js/logic.js";

test("generarNameKey normaliza tildes, mayúsculas y espacios", () => {
  assert.equal(generarNameKey("  María del Carmen López  "), "maria_del_carmen_lopez");
  assert.equal(generarNameKey("José-Ángel García Jr."), "jose_angel_garcia_jr");
  assert.equal(generarNameKey("Ana Belén"), "ana_belen");
});

test("validarNombre exige nombre completo (al menos 2 palabras)", () => {
  assert.equal(validarNombre("Ana").ok, false);
  assert.equal(validarNombre("").ok, false);
  const ok = validarNombre("Carlos Méndez");
  assert.equal(ok.ok, true);
  assert.equal(ok.key, "carlos_mendez");
});

test("validarPadron detecta duplicados por nameKey", () => {
  const padron = ["Juan Pérez", "María Gómez", "Juan  Perez"];
  const res = validarPadron(padron);
  assert.equal(res.ok, false);
  assert.ok(res.errores.some((e) => e.includes("duplicado")));

  const padronValido = ["Juan Pérez", "María Gómez", "Pedro Sánchez"];
  const resOk = validarPadron(padronValido);
  assert.equal(resOk.ok, true);
  assert.equal(resOk.datos.length, 3);
});

test("conteo ignora candidatos ajenos a la ronda", () => {
  const { counts, total } = contarVotos([
    { candidateId: "a" }, { candidateId: "a" }, { candidateId: "b" }, { candidateId: "zzz" }
  ], ["a", "b", "c"]);
  assert.deepEqual(counts, { a: 2, b: 1, c: 0 });
  assert.equal(total, 3);
});

test("líderes y empates", () => {
  assert.deepEqual(lideres({ a: 3, b: 1 }), { max: 3, ids: ["a"], empate: false });
  const e = lideres({ a: 2, b: 2, c: 1 });
  assert.equal(e.empate, true);
  assert.deepEqual(e.ids, ["a", "b"]);
});

test("siguiente cargo: nueva, reusar y completa", () => {
  const cargos = [{ id: "vp", nombre: "VP", orden: 2 }, { id: "pres", nombre: "Presidente", orden: 1 }];
  assert.equal(siguienteCargo(cargos, []).cargo.id, "pres");
  const r1 = { id: "r1", cargoId: "pres", numero: 1, status: "closed", winnerId: "x" };
  assert.equal(siguienteCargo(cargos, [r1]).cargo.id, "vp");
  const empate = { id: "r2", cargoId: "vp", numero: 1, status: "closed", winnerId: null };
  const sv = { id: "r3", cargoId: "vp", numero: 2, status: "pending", winnerId: null };
  const s = siguienteCargo(cargos, [r1, empate, sv]);
  assert.equal(s.tipo, "reusar");
  assert.equal(s.ronda.id, "r3");
  const r4 = { id: "r4", cargoId: "vp", numero: 2, status: "closed", winnerId: "y" };
  assert.equal(siguienteCargo(cargos, [r1, empate, r4]).tipo, "completa");
});

test("espera creciente con tope", () => {
  assert.equal(esperaCreciente(0, 0), 2000);
  assert.equal(esperaCreciente(1, 0), 4000);
  assert.equal(esperaCreciente(10, 0), 30000);
});

test("CSV escapa comas y comillas", () => {
  assert.equal(aCSV([["a", 'b,"c"']]), 'a,"b,""c"""');
});

test("validaciones de importación de directivas y candidatos", () => {
  assert.equal(validarDirectivas([{ nombre: "Diáconos", cargos: [{ nombre: "Presidente" }] }]).ok, true);
  assert.equal(validarDirectivas([{ nombre: "" }]).ok, false);
  const ok = validarCandidatos([{ directivaId: "d", nombre: "Ana", numero: 1 }], ["d"]);
  assert.equal(ok.ok, true);
  assert.equal(ok.datos[0].id, "d-1");
  assert.equal(validarCandidatos([{ directivaId: "d", nombre: "A", numero: 1 }, { directivaId: "d", nombre: "B", numero: 1 }]).ok, false);
});

test("iniciales", () => {
  assert.equal(iniciales("María del Carmen López"), "ML");
  assert.equal(iniciales("Ana"), "A");
});
