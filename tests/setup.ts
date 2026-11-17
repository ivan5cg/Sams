// Las partidas empiezan en la fecha de hoy. Para que las pruebas no dependan del día en que se
// pasan, «hoy» es siempre el lunes 22 de marzo de 2027 (primavera recién empezada).
import { vi } from 'vitest';

export const TEST_TODAY = '2027-03-22';

vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date(`${TEST_TODAY}T10:00:00`));
