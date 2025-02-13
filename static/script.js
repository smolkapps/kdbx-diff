document.getElementById('compareBtn').addEventListener('click', async () => {
    const db1File = document.getElementById('db1').files[0];
    const db2File = document.getElementById('db2').files[0];
    const keyFile1 = document.getElementById('keyFile1').files[0];
    const keyFile2 = document.getElementById('keyFile2').files[0];
    const passwordDb1 = document.getElementById('passwordDb1').value;
    const passwordDb2 = document.getElementById('passwordDb2').value;
    const outputPath = document.getElementById('outputPath').value;

    const statusDiv = document.getElementById('status');
    const downloadLink = document.getElementById('downloadLink');
    downloadLink.style.display = 'none';

    const unencryptedDb1 = document.getElementById('unencryptedDb1').checked;
    const unencryptedDb2 = document.getElementById('unencryptedDb2').checked;


    if (!db1File || !db2File)
    {
        statusDiv.textContent = 'Please select database files.';
        return;
    }
    if (!unencryptedDb1 && !passwordDb1 && !document.getElementById('keyFile1').files[0]) {
        statusDiv.textContent = 'Please enter a password or select a key file for Database 1.';
        return;
    }
    if (!unencryptedDb2 && !passwordDb2 && !document.getElementById('keyFile2').files[0]) {
        statusDiv.textContent = 'Please enter a password or select a key file for Database 2.';
        return;
    }
    if (!outputPath.endsWith('.kdbx')) {
    if (!passwordDb1 && !keyFile1) {
        statusDiv.textContent = 'Database 1 requires either a password or key file.';
        return;
    }
    if (!passwordDb2 && !keyFile2) {
        statusDiv.textContent = 'Database 2 requires either a password or key file.';
        return;
    }

    if (!outputPath.endsWith('.kdbx')) {
        statusDiv.textContent = 'Output file must end in .kdbx';
        return;
    }

    statusDiv.textContent = 'Comparing databases...';

    const formData = new FormData();
    formData.append('db1', db1File);
    formData.append('db2', db2File);
    if (keyFile1) formData.append('keyFile1', keyFile1);
    if (keyFile2) formData.append('keyFile2', keyFile2);
    if (passwordDb1) formData.append('passwordDb1', passwordDb1);
    if (passwordDb2) formData.append('passwordDb2', passwordDb2);
    formData.append('outputPath', outputPath);

    try {
        const response = await fetch('/compare', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = downloadLink.querySelector('a');
            a.href = url;
            a.download = outputPath;
            downloadLink.style.display = 'block';
            statusDiv.textContent = 'Comparison complete! Download the diff database:';
        } else {
            const error = await response.json();
            statusDiv.textContent = 'Error: ' + error.message;
        }
    } catch (error) {
        statusDiv.textContent = 'Error: ' + error;
    }
});