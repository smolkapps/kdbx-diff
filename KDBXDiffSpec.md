# KDBX Database Difference Analyzer
## Technical Specification and Implementation Guide

### Overview
This application takes two KDBX database files as input and produces a new KDBX database containing only the differences between them. The output database will have two main folders:
1. "Missing Entries" - Contains entries that exist in the first database but not in the second
2. "Modified Entries" - Contains entries that exist in both but have differences, organized by modification date

### Dependencies
```bash
npm install kdbxweb argon2
```

### Usage

```bash
node example.js <db1Path> <db2Path> <password1> <password2> <outputPath>
```

Where:

-   `<db1Path>`: Path to the first KDBX database file.
-   `<db2Path>`: Path to the second KDBX database file.
-   `<password1>`: Password for the first database.
-   `<password2>`: Password for the second database.
-   `<outputPath>`: Path to save the resulting diff database.

Example:

```bash
node example.js database1.kdbx database2.kdbx mypassword myotherpassword diff.kdbx
```

### Key Features

1. Entry Matching:
   - Primary matching by UUID if available
   - Fallback matching by title and username
   - Comprehensive field comparison including custom fields

2. Difference Detection:
   - Compares all standard KeePass fields
   - Handles custom fields
   - Preserves protected values
   - Records specific differences in notes

3. Output Organization:
   - Clear separation between missing and modified entries
   - Modified entries grouped by modification date
   - Original values preserved with difference details in notes

### Security Considerations

1. Password Handling:
   - Uses KeePass's ProtectedValue for sensitive data
   - Passwords never stored as plain text
   - Temporary databases properly encrypted

2. File Operations:
   - Original databases opened read-only
   - New database created with secure defaults
   - Proper cleanup of sensitive data in memory

### Limitations

1. The tool assumes entries with matching titles and usernames are the same entry if UUID matching fails
2. Attachment comparisons not implemented in this version
3. History entries are not compared
4. Group structure from original database is not preserved

### Future Enhancements

1. Add support for key file authentication
2. Implement attachment comparison
3. Add history comparison
4. Add option to preserve group structure
5. Add support for comparing more than two databases
6. Add detailed reporting options

### Error Handling

The implementation includes basic error handling, but you may want to add:
1. Validation of input files
2. Specific handling for corrupted databases
3. Better reporting of specific differences
4. Progress reporting for large databases