import { describe, expect, it } from 'vitest';
import { SystemInfoManager } from './systemInfoManager';

describe('SystemInfoManager parseCronJobs', () => {
  const manager = new SystemInfoManager();

  it('parses TAB-separated cron job output correctly', () => {
    const rawData = [
      'root\t17 * * * *\tcd / && run-parts --report /etc/cron.hourly\t/etc/crontab',
      'root\t0 * * * *\t[ -x /usr/lib/php/sessionclean ] && if [ ! -d /run/systemd/system ]; then /usr/lib/php/sessionclean; fi\t/etc/cron.d/php',
      'root\t* * * * *\tcommand -v debian-sa1 > /dev/null && debian-sa1 1 1\t/etc/cron.d/sysstat',
      'root\t@daily\t/etc/cron.daily/logrotate\t/etc/cron.daily/logrotate'
    ].join('\n');

    const result = manager.parseCronJobs(rawData);
    expect(result).toHaveLength(4);

    expect(result[0]).toEqual({
      user: 'root',
      schedule: '17 * * * *',
      command: 'cd / && run-parts --report /etc/cron.hourly',
      source: '/etc/crontab'
    });

    expect(result[1]).toEqual({
      user: 'root',
      schedule: '0 * * * *',
      command: '[ -x /usr/lib/php/sessionclean ] && if [ ! -d /run/systemd/system ]; then /usr/lib/php/sessionclean; fi',
      source: '/etc/cron.d/php'
    });

    expect(result[2]).toEqual({
      user: 'root',
      schedule: '* * * * *',
      command: 'command -v debian-sa1 > /dev/null && debian-sa1 1 1',
      source: '/etc/cron.d/sysstat'
    });

    expect(result[3]).toEqual({
      user: 'root',
      schedule: '@daily',
      command: '/etc/cron.daily/logrotate',
      source: '/etc/cron.daily/logrotate'
    });
  });

  it('auto-repairs comma-concatenated commands from legacy formats', () => {
    const rawData = [
      'root,17 * * * *,cd,/,&&,run-parts,--report,/etc/cron.hourly,/etc/crontab',
      'root,25 6 * * *,test,-x,/usr/sbin/anacron,||,{,cd,/,&&,run-parts,--report,/etc/cron.daily;,},/etc/crontab'
    ].join('\n');

    const result = manager.parseCronJobs(rawData);
    expect(result).toHaveLength(2);

    expect(result[0].user).toBe('root');
    expect(result[0].schedule).toBe('17 * * * *');
    expect(result[0].command).toBe('cd / && run-parts --report /etc/cron.hourly');
    expect(result[0].source).toBe('/etc/crontab');

    expect(result[1].command).toBe('test -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.daily; }');
  });

  it('strips -e prefix from user field caused by dash/sh shell echo -e', () => {
    const rawData = '-e root\t@daily\t/etc/cron.daily/dpkg\t/etc/cron.daily/dpkg';
    const result = manager.parseCronJobs(rawData);
    expect(result).toHaveLength(1);
    expect(result[0].user).toBe('root');
    expect(result[0].schedule).toBe('@daily');
  });
});
