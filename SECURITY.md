# Security

The sites are static: there is no server, login, submitted form, or cookie. Even so, flaws can
exist, such as HTML injection through URL parameters (`?lab=`, `?passo=`), malicious imported
progress files, or problems in the build chain.

To report a vulnerability, use the repository's **Security → Report a vulnerability** tab
(GitHub private advisory). Please don't open a public issue. We will reply as soon as possible
and agree on disclosure once the fix is out.

Out of scope: the content of the attack lessons, which describe known, documented techniques
(ARP spoofing, SYN flood) only as simulations, together with detection and defense.
