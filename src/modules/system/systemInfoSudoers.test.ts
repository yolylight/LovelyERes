import { describe, expect, it } from 'vitest';
import { SystemInfoManager } from './systemInfoManager';

describe('SystemInfoManager parseSudoersConfig', () => {
  const manager = new SystemInfoManager();

  it('parses valid user and group sudoers rules correctly', () => {
    const rawData = [
      'root,ALL,ALL,ALL,NO,/etc/sudoers',
      '%wheel,ALL,ALL,ALL,YES,/etc/sudoers',
      'deploy,ALL,ALL,/usr/bin/systemctl restart nginx,YES,/etc/sudoers.d/deploy'
    ].join('\n');

    const result = manager.parseSudoersConfig(rawData);
    expect(result).toHaveLength(3);

    expect(result[0]).toEqual({
      user: 'root',
      host: 'ALL',
      runas: 'ALL',
      command: 'ALL',
      nopasswd: 'NO',
      source: '/etc/sudoers'
    });

    expect(result[1]).toEqual({
      user: '%wheel',
      host: 'ALL',
      runas: 'ALL',
      command: 'ALL',
      nopasswd: 'YES',
      source: '/etc/sudoers'
    });

    expect(result[2]).toEqual({
      user: 'deploy',
      host: 'ALL',
      runas: 'ALL',
      command: '/usr/bin/systemctl restart nginx',
      nopasswd: 'YES',
      source: '/etc/sudoers.d/deploy'
    });
  });

  it('filters out include directives and Defaults without treating them as users/groups', () => {
    const rawData = [
      '@includedir,ALL,ALL,@includedir /etc/sudoers.d,NO,/etc/sudoers',
      '@include,ALL,ALL,@include /etc/sudoers.d/custom,NO,/etc/sudoers',
      '#includedir,ALL,ALL,#includedir /etc/sudoers.d,NO,/etc/sudoers',
      'Defaults,ALL,ALL,env_reset,NO,/etc/sudoers',
      'admin,ALL,ALL,ALL,NO,/etc/sudoers'
    ].join('\n');

    const result = manager.parseSudoersConfig(rawData);
    expect(result).toHaveLength(1);
    expect(result[0].user).toBe('admin');
  });
});
