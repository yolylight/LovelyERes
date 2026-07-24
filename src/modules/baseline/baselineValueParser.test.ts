import { describe, it, expect } from 'vitest';
import { parseBaselineValue } from './baselineConfigs';

describe('parseBaselineValue', () => {
  it('应当正确解析正常的配置值 no', () => {
    const output = 'PermitRootLogin no';
    const regex = 'PermitRootLogin\\s+(\\S+)';
    expect(parseBaselineValue(regex, output)).toBe('no');
  });

  it('应当正确解析正常的配置值 yes', () => {
    const output = 'PermitRootLogin yes';
    const regex = 'PermitRootLogin\\s+(\\S+)';
    expect(parseBaselineValue(regex, output)).toBe('yes');
  });

  it('应当防范 #PermitRootLogin not set 输出被误识别为 not', () => {
    const output = '#PermitRootLogin not set';
    const regex = 'PermitRootLogin\\s+(\\S+)';
    expect(parseBaselineValue(regex, output)).toBe('not set');
  });

  it('当存在注释行与生效行时，应当优先提取生效行', () => {
    const output = '#PermitRootLogin yes\nPermitRootLogin prohibit-password';
    const regex = 'PermitRootLogin\\s+(\\S+)';
    expect(parseBaselineValue(regex, output)).toBe('prohibit-password');
  });

  it('当 SSH 通道打开异常时，应当返回错误提示', () => {
    const output = 'Failed to open channel: Failed to open channel (ConnectFailed)';
    const regex = 'PermitRootLogin\\s+(\\S+)';
    expect(parseBaselineValue(regex, output)).toBe('(读取失败: SSH通道打开异常)');
  });

  it('对于只读排查项，当只返回了文件标题头而无任何真实内容时，应当返回无异常', () => {
    const output = '=== /home/user/.bashrc ===\nscan done';
    const regex = '([\\s\\S]+)';
    expect(parseBaselineValue(regex, output, true)).toBe('(未找到匹配记录/无异常)');
  });

  it('对于只读排查项，当工具缺失返回 not found 错误时，应当转化为工具缺失或无异常', () => {
    const output = 'sh: 1: last: not found';
    const regex = '([\\s\\S]+)';
    expect(parseBaselineValue(regex, output, true)).toBe('(工具或记录不可用/无异常)');
  });
});
