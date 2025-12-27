const https = require('https');

class LeetCodeDaily {
    constructor() {
        this.baseUrl = 'leetcode.com';
        this.graphqlEndpoint = '/graphql';
    }

    // Make GraphQL request to LeetCode API
    async makeRequest(query, variables = {}) {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify({ query, variables });

            const options = {
                hostname: this.baseUrl,
                path: this.graphqlEndpoint,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://leetcode.com'
                }
            };

            const req = https.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (e) {
                        reject(new Error('Failed to parse response'));
                    }
                });
            });

            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    // Get today's daily challenge
    async getDailyChallenge() {
        const query = `
            query questionOfToday {
                activeDailyCodingChallengeQuestion {
                    date
                    link
                    question {
                        questionId
                        questionFrontendId
                        title
                        titleSlug
                        difficulty
                        topicTags {
                            name
                        }
                    }
                }
            }
        `;

        const response = await this.makeRequest(query);
        return response.data.activeDailyCodingChallengeQuestion;
    }

    // Get detailed problem info
    async getProblemDetails(titleSlug) {
        const query = `
            query getQuestionDetail($titleSlug: String!) {
                question(titleSlug: $titleSlug) {
                    questionId
                    questionFrontendId
                    title
                    titleSlug
                    content
                    difficulty
                    likes
                    dislikes
                    categoryTitle
                    topicTags {
                        name
                        slug
                    }
                    codeSnippets {
                        lang
                        langSlug
                        code
                    }
                    sampleTestCase
                    exampleTestcases
                    hints
                    stats
                }
            }
        `;

        const response = await this.makeRequest(query, { titleSlug });
        return response.data.question;
    }

    // Clean HTML content to readable text
    cleanHtmlContent(html) {
        if (!html) return '';
        return html
            .replace(/<pre>/g, '\n```\n')
            .replace(/<\/pre>/g, '\n```\n')
            .replace(/<code>/g, '`')
            .replace(/<\/code>/g, '`')
            .replace(/<strong>/g, '**')
            .replace(/<\/strong>/g, '**')
            .replace(/<em>/g, '*')
            .replace(/<\/em>/g, '*')
            .replace(/<sup>/g, '^')
            .replace(/<\/sup>/g, '')
            .replace(/<sub>/g, '_')
            .replace(/<\/sub>/g, '')
            .replace(/<li>/g, '• ')
            .replace(/<\/li>/g, '\n')
            .replace(/<ul>/g, '\n')
            .replace(/<\/ul>/g, '')
            .replace(/<ol>/g, '\n')
            .replace(/<\/ol>/g, '')
            .replace(/<p>/g, '\n')
            .replace(/<\/p>/g, '\n')
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // Format the output
    formatOutput(daily, details) {
        const divider = '═'.repeat(70);
        const subDivider = '─'.repeat(70);

        let output = `
${divider}
🎯 LEETCODE DAILY CHALLENGE - ${daily.date}
${divider}

📌 Problem #${details.questionFrontendId}: ${details.title}
🔗 Link: https://leetcode.com${daily.link}
📊 Difficulty: ${this.getDifficultyEmoji(details.difficulty)} ${details.difficulty}
👍 Likes: ${details.likes} | 👎 Dislikes: ${details.dislikes}
🏷️  Topics: ${details.topicTags.map(t => t.name).join(', ')}

${subDivider}
📝 PROBLEM DESCRIPTION
${subDivider}
${this.cleanHtmlContent(details.content)}

${subDivider}
🧪 TEST CASES
${subDivider}
${details.exampleTestcases || details.sampleTestCase || 'No test cases available'}

`;

        // Add hints if available
        if (details.hints && details.hints.length > 0) {
            output += `${subDivider}
💡 HINTS
${subDivider}
`;
            details.hints.forEach((hint, i) => {
                output += `${i + 1}. ${this.cleanHtmlContent(hint)}\n`;
            });
            output += '\n';
        }

        // Add code snippets for all languages
        output += `${subDivider}
💻 CODE TEMPLATES (All Languages)
${subDivider}
`;

        if (details.codeSnippets) {
            details.codeSnippets.forEach(snippet => {
                output += `
┌─── ${snippet.lang} ───
${snippet.code}
└${'─'.repeat(50)}
`;
            });
        }

        output += `\n${divider}\n`;
        return output;
    }

    getDifficultyEmoji(difficulty) {
        switch (difficulty) {
            case 'Easy': return '🟢';
            case 'Medium': return '🟡';
            case 'Hard': return '🔴';
            default: return '⚪';
        }
    }

    // Main function to fetch and display today's problem
    async fetchTodaysProblem() {
        try {
            console.log('🔄 Fetching today\'s LeetCode challenge...\n');

            // Get daily challenge info
            const daily = await this.getDailyChallenge();
            
            if (!daily) {
                throw new Error('Could not fetch daily challenge');
            }

            // Get detailed problem info
            const details = await this.getProblemDetails(daily.question.titleSlug);

            if (!details) {
                throw new Error('Could not fetch problem details');
            }

            // Display formatted output
            const output = this.formatOutput(daily, details);
            console.log(output);

            // Return data for programmatic use
            return {
                date: daily.date,
                link: `https://leetcode.com${daily.link}`,
                problem: {
                    id: details.questionFrontendId,
                    title: details.title,
                    difficulty: details.difficulty,
                    description: this.cleanHtmlContent(details.content),
                    topics: details.topicTags.map(t => t.name),
                    likes: details.likes,
                    dislikes: details.dislikes
                },
                testCases: details.exampleTestcases || details.sampleTestCase,
                hints: details.hints,
                codeSnippets: details.codeSnippets
            };

        } catch (error) {
            console.error('❌ Error:', error.message);
            throw error;
        }
    }

    // Save to file
    async saveToFile(filename = 'leetcode-daily.txt') {
        const fs = require('fs');
        const data = await this.fetchTodaysProblem();
        
        // Create a formatted text file
        const daily = await this.getDailyChallenge();
        const details = await this.getProblemDetails(daily.question.titleSlug);
        const content = this.formatOutput(daily, details);
        
        fs.writeFileSync(filename, content);
        console.log(`\n✅ Saved to ${filename}`);
        
        // Also save JSON for programmatic access
        fs.writeFileSync('leetcode-daily.json', JSON.stringify(data, null, 2));
        console.log(`✅ Saved to leetcode-daily.json`);
    }
}

// Run the script
async function main() {
    const leetcode = new LeetCodeDaily();
    
    // Check command line arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--save') || args.includes('-s')) {
        await leetcode.saveToFile();
    } else {
        await leetcode.fetchTodaysProblem();
    }
}

// Export for use as module
module.exports = LeetCodeDaily;

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}
