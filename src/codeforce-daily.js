const https = require('https');
const fs = require('fs');

class CodeforcesDaily {
    constructor() {
        this.baseUrl = 'codeforces.com';
        this.apiPath = '/api/problemset.problems';
    }

    // Generic HTTPS GET
    async makeRequest(path) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: this.baseUrl,
                path,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            };

            const req = https.request(options, res => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch {
                        reject(new Error('Failed to parse JSON'));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    // Fetch all problems
    async getAllProblems() {
        const response = await this.makeRequest(this.apiPath);
        if (response.status !== 'OK') {
            throw new Error('Codeforces API error');
        }
        return response.result.problems;
    }

    // Deterministic "daily" problem (same problem for same date)
    pickDailyProblem(problems) {
        const today = new Date().toISOString().slice(0, 10);
        const seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0);
        return problems[seed % problems.length];
    }

    formatProblem(problem) {
        return {
            platform: 'Codeforces',
            contestId: problem.contestId,
            index: problem.index,
            title: problem.name,
            difficulty: problem.rating || 'Unrated',
            tags: problem.tags,
            url: `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`
        };
    }

    async fetchDailyProblem() {
        console.log('⚡ Fetching Codeforces daily problem...\n');

        const problems = await this.getAllProblems();
        const daily = this.pickDailyProblem(problems);
        const formatted = this.formatProblem(daily);

        console.log(formatted);
        return formatted;
    }

    async saveToFile(filename = 'codeforces-daily.json') {
        const data = await this.fetchDailyProblem();
        fs.writeFileSync(filename, JSON.stringify(data, null, 2));
        console.log(`\n✅ Saved to ${filename}`);
    }
}

// CLI runner
async function main() {
    const cf = new CodeforcesDaily();
    const args = process.argv.slice(2);

    if (args.includes('--save') || args.includes('-s')) {
        await cf.saveToFile();
    } else {
        await cf.fetchDailyProblem();
    }
}

module.exports = CodeforcesDaily;

if (require.main === module) {
    main().catch(console.error);
}
