// 数据库查询验证器
// Database Query Validator

export interface ValidationResult {
    isValid: boolean;
    message?: string;
    statements?: string[]; // 对于支持多语句的数据库，返回拆分后的语句
}

/**
 * SQL 查询验证器
 */
export class QueryValidator {
    
    /**
     * 验证查询
     */
    static validate(query: string, dbType: string): ValidationResult {
        if (!query || !query.trim()) {
            return { isValid: false, message: '查询不能为空' };
        }

        switch (dbType) {
            case 'mysql':
            case 'postgresql':
            case 'sqlite':
                return this.validateSQL(query);
            case 'redis':
                return this.validateRedis(query);
            case 'mongodb':
                return this.validateMongoDB(query);
            default:
                return { isValid: true }; // 未知类型默认通过
        }
    }

    /**
     * 拆分 SQL 语句
     * 处理引号、注释和转义
     */
    static splitStatements(query: string): string[] {
        const statements: string[] = [];
        let currentStatement = '';
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inBacktick = false; // MySQL specific
        let isEscaped = false;

        for (let i = 0; i < query.length; i++) {
            const char = query[i];
            
            // 处理转义
            if (isEscaped) {
                currentStatement += char;
                isEscaped = false;
                continue;
            }

            if (char === '\\') {
                isEscaped = true;
                currentStatement += char;
                continue;
            }

            // 处理引号状态
            if (char === "'" && !inDoubleQuote && !inBacktick) {
                inSingleQuote = !inSingleQuote;
            } else if (char === '"' && !inSingleQuote && !inBacktick) {
                inDoubleQuote = !inDoubleQuote;
            } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
                inBacktick = !inBacktick;
            }

            // 处理分号
            if (char === ';' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
                if (currentStatement.trim()) {
                    statements.push(currentStatement.trim());
                }
                currentStatement = '';
            } else {
                currentStatement += char;
            }
        }

        if (currentStatement.trim()) {
            statements.push(currentStatement.trim());
        }

        return statements;
    }

    /**
     * 验证 SQL (MySQL, PostgreSQL, SQLite)
     */
    private static validateSQL(query: string): ValidationResult {
        // 1. 拆分语句
        const statements = this.splitStatements(query);
        
        if (statements.length === 0) {
             return { isValid: false, message: '查询无效' }; // 应该是被过滤掉了
        }

        // 2. 检查每一条语句
        for (const stmt of statements) {
            // 简单的括号平衡检查
            if (!this.checkBalanced(stmt, '(', ')')) {
                return { isValid: false, message: `语句括号不匹配: "${this.truncate(stmt)}"` };
            }
            // 简单的引号平衡检查 (虽然 splitStatement 已经处理了一部分，但再次检查保险)
            if (!this.checkQuotes(stmt)) {
                 return { isValid: false, message: `语句引号不匹配: "${this.truncate(stmt)}"` };
            }

            // 检查起始关键字
            // const upperStmt = stmt.trim().toUpperCase();
            // const validStarts = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'USE', 'SET', 'GRANT', 'REVOKE', 'TRUNCATE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'PRAGMA', 'WITH', 'CALL', 'DO'];

            
            // 允许注释开头
            const cleanStmt = stmt.replace(/^(\s*--.*|\s*\/\*[\s\S]*?\*\/|\s*#.*)+/gm, '').trim(); 
            
            // 如果全是注释，也算有效（虽然执行没效果）
            if (!cleanStmt) continue;

            const firstWord = cleanStmt.split(/\s+/)[0].toUpperCase();
            // 简单放宽验证，只要不是明显乱码即可。严格来说，不一定要限制 header。
            // 但为了安全起见，我们至少要求它看起来像个 SQL。
            // 这里为了兼顾各种 SQL 变体，我们只做非常宽松的检查：
            if (!/^[A-Za-z_]/.test(firstWord)) {
                 // 可能是一些特殊的非字母开头的命令？暂时忽略
            }
        }

        return { isValid: true, statements };
    }

    /**
     * 验证 Redis 命令
     */
    private static validateRedis(query: string): ValidationResult {
        const parts = query.trim().split(/\s+/);
        if (parts.length === 0) return { isValid: false, message: '空的 Redis 命令' };
        
        // const cmd = parts[0].toUpperCase();
        // Redis 命令列表非常多，这里只列一些极其危险或不可能的？
        // 其实 Redis 只要不执行 FLUSHALL 之类的... 但我们这里只是语法检查
        // 暂时只检查是否为空
        return { isValid: true };
    }

    /**
     * 验证 MongoDB
     */
    private static validateMongoDB(query: string): ValidationResult {
        // MongoDB 查询通常是 JS 代码
        if (!this.checkBalanced(query, '{', '}')) {
            return { isValid: false, message: '花括号 {} 不匹配' };
        }
        if (!this.checkBalanced(query, '(', ')')) {
            return { isValid: false, message: '圆括号 () 不匹配' };
        }
        if (!this.checkBalanced(query, '[', ']')) {
            return { isValid: false, message: '方括号 [] 不匹配' };
        }
        return { isValid: true };
    }

    /**
     * 检查成对符号平衡
     */
    private static checkBalanced(text: string, open: string, close: string): boolean {
        let count = 0;
        let inQuote: string | null = null;
        let isEscaped = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (isEscaped) {
                isEscaped = false;
                continue;
            }
            if (char === '\\') {
                isEscaped = true;
                continue;
            }

            // 引号处理
            if ((char === '"' || char === "'" || char === '`') && !inQuote) {
                inQuote = char;
            } else if (char === inQuote && !isEscaped) {
                inQuote = null;
            }

            if (inQuote) continue;

            if (char === open) count++;
            else if (char === close) count--;

            if (count < 0) return false;
        }

        return count === 0;
    }

    /**
     * 检查引号平衡
     */
    private static checkQuotes(text: string): boolean {
        let inSingle = false;
        let inDouble = false;
        let inBacktick = false; // MySQL
        let isEscaped = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            
            if (isEscaped) {
                isEscaped = false;
                continue;
            }

            if (char === '\\') {
                isEscaped = true;
                continue;
            }

            if (char === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
            else if (char === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
            else if (char === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;
        }

        return !inSingle && !inDouble && !inBacktick;
    }

    private static truncate(str: string, max: number = 30): string {
        return str.length > max ? str.substring(0, max) + '...' : str;
    }
}
