async function main() {
  const res = await fetch("http://localhost:5000/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "mobiletest@hirestream.dev",
      password: "password123" // we don't know the password
    })
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Response:", data);
}

main().catch(console.error);
