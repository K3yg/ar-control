# Capabilities do aparelho

O mapeamento usado pelo código está em `lib/capabilities.ts`. Depois de conectar o SmartThings,
abra `GET /api/debug` (logado no app ou com o header `x-ac-key`) para ver os aparelhos da conta, o
aparelho escolhido, as capabilities do componente `main` e o status bruto.

| Função      | Capability                          | Comando                          | Status confirmado? |
|-------------|-------------------------------------|----------------------------------|--------------------|
| Liga/desliga| `switch`                            | `on` / `off`                     | ☐ |
| Temperatura | `thermostatCoolingSetpoint`         | `setCoolingSetpoint(25)`         | ☐ |
| Modo        | `airConditionerMode`                | `setAirConditionerMode("cool")`  | ☐ |
| WindFree    | `custom.airConditionerOptionalMode` | `setAcOptionalMode("windFree")` / `("off")` | ☐ (ver `supportedAcOptionalMode`) |
| Display     | `samsungce.airConditionerLighting` **ou** `execute` | `on`/`off` **ou** `execute("mode/vs/0", {"x.com.samsung.da.options": ["Light_On"]})` | ☐ |

## Display

A estratégia é escolhida sozinha (`AC_DISPLAY_STRATEGY=auto`): usa `samsungce.airConditionerLighting`
se o aparelho tiver, senão o hack via `execute`. No hack, `Light_On` **desliga** o display (nome invertido).
Para forçar uma delas, defina `AC_DISPLAY_STRATEGY` como `lighting`, `execute` ou `none`.

Com `execute` o aparelho não informa o estado do display; o app mostra o último valor enviado.

## Anotações do aparelho real

- deviceId:
- `supportedAcOptionalMode`:
- Display funcionou com:
