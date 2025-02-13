document.getElementById('db1').addEventListener('change', handleFileLoad);
document.getElementById('db2').addEventListener('change', handleFileLoad);

function handleFileLoad(event) {
    const file = event.target.files[0];
    const fileId = event.target.id;
    const statusSpan = document.getElementById(fileId + 'Status');

    // Remove fade-out class in case a file is re-selected
    statusSpan.classList.remove('fade-out');

    if (file) {
        statusSpan.textContent = `File loaded: ${file.name}`;
        statusSpan.style.color = 'green';

        // If it's db1, suggest an output filename.
        if (fileId === 'db1') {
            const baseName = file.name.replace('.kdbx', '');
            document.getElementById('outputPath').value = `${baseName}-diff.kdbx`;
        }

        // Add fade-out class after 2 seconds
        setTimeout(() => {
            statusSpan.classList.add('fade-out');
        }, 2000);

    } else {
        statusSpan.textContent = '';
    }
}

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
    const diffOutputDiv = document.getElementById('diff-output');
    diffOutputDiv.innerHTML = ''; // Clear previous diff

    if (!db1File || !db2File) {
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
            const data = await response.json(); // Expecting JSON now
            const blob = new Blob([data.diffBuffer], { type: 'application/octet-stream' });
            const url = window.URL.createObjectURL(blob);
            const a = downloadLink.querySelector('a');
            a.href = url;
            a.download = outputPath;
            downloadLink.style.display = 'block';
            statusDiv.textContent = 'Comparison complete! Download the diff database:';

            // Display the diff
            diffOutputDiv.innerHTML = `<pre>${data.diffString}</pre>`;

        } else {
            const error = await response.json();
            statusDiv.textContent = 'Error: ' + error.message;
        }
    } catch (error) {
        statusDiv.textContent = 'Error: ' + error;
    }
});