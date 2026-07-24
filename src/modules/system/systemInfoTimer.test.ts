import { describe, expect, it } from 'vitest';
import { SystemInfoManager } from './systemInfoManager';

describe('SystemInfoManager parseSystemdTimers', () => {
  const manager = new SystemInfoManager();

  it('parses systemctl list-timers output with timezones and relative times correctly', () => {
    const rawData = [
      'Fri 2026-07-24 01:39:00 EDT 17min left Fri 2026-07-24 01:09:04 EDT 12min ago logrotate.timer logrotate.service',
      'Fri 2026-07-24 06:39:10 EDT 5h 17min left Thu 2026-07-23 22:00:00 EDT 3h 17min ago dnf-makecache.timer dnf-makecache.service',
      'Sun 2026-07-26 03:10:09 EDT 2 days left Wed 2026-07-22 20:00:00 EDT 7h ago certbot.timer certbot.service'
    ].join('\n');

    const result = manager.parseSystemdTimers(rawData);
    expect(result).toHaveLength(3);

    expect(result[0]).toEqual({
      timer: 'logrotate.timer',
      next: 'Fri 2026-07-24 01:39:00 EDT',
      left: '17min left',
      last: 'Fri 2026-07-24 01:09:04 EDT',
      unit: 'logrotate.timer',
      activates: 'logrotate.service'
    });

    expect(result[1]).toEqual({
      timer: 'dnf-makecache.timer',
      next: 'Fri 2026-07-24 06:39:10 EDT',
      left: '5h 17min left',
      last: 'Thu 2026-07-23 22:00:00 EDT',
      unit: 'dnf-makecache.timer',
      activates: 'dnf-makecache.service'
    });

    expect(result[2]).toEqual({
      timer: 'certbot.timer',
      next: 'Sun 2026-07-26 03:10:09 EDT',
      left: '2 days left',
      last: 'Wed 2026-07-22 20:00:00 EDT',
      unit: 'certbot.timer',
      activates: 'certbot.service'
    });
  });

  it('handles n/a in next or last trigger times', () => {
    const rawData = [
      'n/a n/a Fri 2026-07-24 01:09:04 EDT 12min ago inactive.timer inactive.service',
      'Fri 2026-07-24 01:39:00 EDT 17min left n/a n/a new.timer new.service',
      'n/a n/a n/a n/a never.timer never.service'
    ].join('\n');

    const result = manager.parseSystemdTimers(rawData);
    expect(result).toHaveLength(3);

    expect(result[0]).toEqual({
      timer: 'inactive.timer',
      next: 'n/a',
      left: 'n/a',
      last: 'Fri 2026-07-24 01:09:04 EDT',
      unit: 'inactive.timer',
      activates: 'inactive.service'
    });

    expect(result[1]).toEqual({
      timer: 'new.timer',
      next: 'Fri 2026-07-24 01:39:00 EDT',
      left: '17min left',
      last: 'n/a',
      unit: 'new.timer',
      activates: 'new.service'
    });

    expect(result[2]).toEqual({
      timer: 'never.timer',
      next: 'n/a',
      left: 'n/a',
      last: 'n/a',
      unit: 'never.timer',
      activates: 'never.service'
    });
  });

  it('correctly parses outputs without the explicit left keyword', () => {
    const rawData = 'Sat 2026-07-25 07:50:43 EDT 1 day 6h Fri 2026-07-24 00:25:38 EDT 1h 0min ago logrotate.timer logrotate.service';
    const result = manager.parseSystemdTimers(rawData);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      timer: 'logrotate.timer',
      next: 'Sat 2026-07-25 07:50:43 EDT',
      left: '1 day 6h',
      last: 'Fri 2026-07-24 00:25:38 EDT',
      unit: 'logrotate.timer',
      activates: 'logrotate.service'
    });
  });
});
