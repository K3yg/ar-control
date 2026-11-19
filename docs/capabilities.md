# Device capabilities

Mappings live in `lib/capabilities.ts`. `GET /api/debug` shows the account's devices, the chosen
device, its capabilities and the raw status. Confirmed on a Samsung WindFree (Room air conditioner):

| Feature | Capability | Command | Values |
|---|---|---|---|
| Power | `switch` | `on` / `off` | |
| Temperature | `thermostatCoolingSetpoint` | `setCoolingSetpoint(n)` | 16–30 (`custom.thermostatSetpointControl`) |
| Mode | `airConditionerMode` | `setAirConditionerMode(m)` | `auto`, `cool`, `dry`, `wind` |
| Fan speed | `airConditionerFanMode` | `setFanMode(f)` | `auto`, `low`, `medium`, `high`, `turbo` |
| Airflow | `fanOscillationMode` | `setFanOscillationMode(s)` | `fixed`, `vertical`, `horizontal`, `all` |
| WindFree & co. | `custom.airConditionerOptionalMode` | `setAcOptionalMode(o)` | `off`, `windFree`, `windFreeSleep`, `sleep`, `quiet`, `smart`, `speed` |
| Display | `samsungce.airConditionerLighting` | `on` / `off` | |
| Humidity | `relativeHumidityMeasurement` | | read only |
| Power use | `powerConsumptionReport` | | read only (W, Wh) |

Notes:

- While WindFree is on, `availableAcFanModes` is only `auto`. The app turns WindFree off before setting a fan speed.
- WindFree only works in `cool`; the app switches to cool when enabling it.
- Units without `samsungce.airConditionerLighting` can use the community workaround through `execute`
  (`AC_DISPLAY_STRATEGY=execute`). Its naming is inverted: `Light_On` turns the display **off**.
