const KdbxDiffAnalyzer = require('./KdbxDiffAnalyzer');

async function main() {
    if (process.argv.length &lt; 7) {
        console.log('Usage: node example.js <db1Path> <db2Path> <password1> <password2> <outputPath>');
        process.exit(1);
    }

    const db1Path = process.argv[2];
    const db2Path = process.argv[3];
    const password1 = process.argv[4];
    const password2 = process.argv[5];
    const outputPath = process.argv[6];

    try {
        const analyzer = new KdbxDiffAnalyzer();
        await analyzer.compareDatabases(
            db1Path,
            db2Path,
            password1,
            password2,
            outputPath
        );
        console.log('Diff database created successfully');
    } catch (error) {
        console.error('Error comparing databases:', error);
    }
}

main();