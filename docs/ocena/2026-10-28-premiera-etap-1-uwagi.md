# Premiera, etap 1: rozstrzygnięcia i odłożone uwagi

Wyciąg z dziennika budowy subagentami na gałęzi `wyjscie-na-swiat` (28.10.2026). Plan: `docs/superpowers/plans/2026-10-28-premiera-etap-1-fundament.md`, projekt: `docs/superpowers/specs/2026-10-28-wyjscie-na-swiat-design.md`. Rozstrzygnięcia podjął koordynator w trakcie budowy, bo projekt i plan ich nie przesądzały; każde da się odwrócić. Uwagi odłożone to te, które przeglądy uznały za drobne albo do zrobienia później, a które po zbiorczej poprawce dalej są otwarte.

## Rozstrzygnięcia (co, dlaczego, ile kosztuje, jeśli źle)

1. Kod powrotu (`POST /api/druzyna/kod`) działa dla każdego zalogowanego konta, także z nickiem: prościej. Jeśli źle: wyłączenie dla kont z nickiem to jeden warunek.
2. `POST /api/druzyna` z ważną sesją oddaje to konto bez zakładania nowego: nie mnożymy kont. Jeśli źle: gracz z nickiem nie dostanie osobnej drużyny anonimowej.
3. Limit nowych kodów: 10 na godzinę na konto (plan nie podawał). Jeśli źle: zmiana jednej liczby.
4. Okno złych prób jest wspólne dla kodu i hasła na adres IP (tak każe plan). Jeśli źle: za siecią z jednym IP (akademik, sieć komórkowa) dziesięć pomyłek blokuje powrót kodem wszystkim na 15 minut; osobne okno to jedna linijka.
5. Nowa siedziba i przejęcie siedziby po zwolnieniu liczą się do tego samego okna 5 zmian okolicy na dobę co punkt startu; nowa siedziba w zasięgu punktu startu jest darmowa. Powód: zebranie zajętych klatek z miasta ma wymagać zakładania kont. Jeśli źle: kto zaczyna grę sześć razy dziennie w różnych miastach, czeka z siecią do jutra.
6. Zajęcie, które liczyłoby się do tego okna (drużyna bez siedziby, poza zasięgiem punktu startu), liczy się przed sprawdzeniem zajętości i nie wraca przy odpowiedzi „zajęta”; inaczej zajęte klatki dałoby się sondować za darmo. Jeśli źle: gracz, którego dalekie zajęcie trafi w zajętą klatkę, traci jedno z 5 miejsc w dobie.
7. Klient czeka na `/api/adres` 8 s, a potem sam pyta Nominatim (serwer w najgorszym razie odpowiada po 15 s). Jeśli źle: przy powolnym Nominatim dwa zapytania o ten sam adres.
8. Gra kończy na „nie ma takiego adresu” tylko przy zdaniu `KOMUNIKAT_BRAK_ADRESU` wspólnym z serwerem; każda inna odpowiedź 404 (np. starszy serwer bez tej trasy) daje jedno zapytanie wprost do Nominatim. Jeśli źle: zmiana tego zdania na serwerze bez stałej zamieniłaby brak adresu w zapytanie do Nominatim.
9. Do serwera adres idzie zawsze po polsku, nie w języku gry, bo z etykiety liczy się ziarno świata i imiona mieszkańców. Jeśli źle: gracz po angielsku widzi polską nazwę miejsca w linii „Jest: …”.
10. Adres idzie przez nasz serwer tylko przy włączonej sieci (`geocode` bez domyślnego klienta), więc przed zatwierdzeniem informacji o danych nie trafia na nasz serwer. Jeśli źle: do włączenia sieci wyszukiwanie zostaje w przeglądarce jak dziś.
11. `druzyna()` wołane raz na start nowej gry; po błędzie gra bez sieci z jednym komunikatem. Jeśli źle: chwilowa awaria serwera kosztuje grę bez sieci do następnego startu.
12. Przy 409 `brak_startu` w odświeżaniu: punkt startu i jedna ponowna próba; przy 429 cicho zostaje stara lista. Jeśli źle: znaczniki klatek bywają nieaktualne do następnego odświeżenia.
13. Okno z kodem po pierwszym ranku pojawia się tylko u drużyny, która nigdy nie miała kodu, bo serwer nie umie pokazać istniejącego kodu, a nowy unieważnia stary. Jeśli źle: kto zgubił kod, sam bierze nowy z Menu.
14. Przycisk w Menu to „Nowy kod powrotu drużyny”, bo każde kliknięcie wymienia kod. Jeśli źle: zmiana napisu.
15. Szkice informacji o danych i regulaminu leżą w `public/` z `noindex`; `main` scala Mateusz dopiero po ich wypełnieniu. Jeśli źle: ktoś zobaczy szkic z miejscami do wypełnienia na adresie podglądu.
16. `api-prod` tylko na wyraźne żądanie: profil compose `prod`, własny katalog źródeł, `ZM_PROD=1` z czystego `main` równego `origin/main`; zwykłe wdrożenie testowe go nie dotyka; sekrety produkcji wymagane tylko wtedy, a zwykłe wdrożenie tylko ostrzega. Jeśli źle: produkcja wymaga osobnego polecenia przy każdej zmianie serwera.
17. Polecenia dla Caddy cergo są idempotentne: kopia sprawdzona `cmp`, dopisanie tylko gdy bloku nie ma, `validate && reload` albo przywrócenie kopii. Jeśli źle: tylko dłuższe polecenie.
18. Krok 0: zanim ta gałąź trafi na serwer testowy, każda gałąź wdrażana na test musi ją zawierać (schemat bazy w wersji 3, stary `wdroz.sh` kasuje `.env`, stary compose usuwa `api-prod`). Jeśli źle: dłuższa droga do pierwszego wdrożenia.
19. Sesja drużyny anonimowej przesuwa się do pełnej długości przy pierwszej wizycie dnia i trwa tyle, ile żyje konto (180 dni); konta z nickiem 30 dni. Jeśli źle: dłużej żyjące ciasteczko na współdzielonym komputerze.
20. Pusty wynik Photona bez odpowiedzi Nominatim to 503 bez zapamiętania, więc przeglądarka pyta Nominatim sama. Jeśli źle: więcej zapytań z przeglądarek przy fali.
21. Serwer testowy buduje grę z `VITE_SIEC=1` (projekt: `?siec=1` znika najpierw na teście); `api-prod` dopiero po zatwierdzeniu informacji o danych. Jeśli źle: produkcja sieciowa później; na teście powstają prawdziwe drużyny, choć tekst ma jeszcze miejsca do wypełnienia.
22. Wynik Photona z etykietą w innym formacie zostaje (inne ziarno dla tego samego adresu), bo to rzadki przypadek przy fali, pamiętany dobę. Jeśli źle: ten sam adres raz na jakiś czas daje innych mieszkańców.
23. `ZM_API` i `ZM_PROXY_SEKRET` na Vercelu ustawione dla Production od początku, bez `VITE_SIEC`. Jeśli źle: nic, gra produkcyjna i tak nie woła `/api`.

## Odłożone uwagi, dalej otwarte

Serwer:
- Nagłówek adresu z proxy bierze pierwszy wpis listy, a X-Forwarded-For ostatni; ujednolicić albo odrzucać wiele wartości (sprawdzić podrobiony `X-Real-IP` przez podgląd Vercela).
- `pasujeZrodlo` kompiluje wyrażenie przy każdym żądaniu; brak testu na zdublowany `x-zm-proxy`.
- `przytnijSesje` przycina po chwili założenia, więc jedenaste wejście kodem może wylogować pierwsze urządzenie.
- Skok zegara wstecz wstrzymuje wygasanie do restartu; długa przerwa serwera wygasza wszystkich naraz; sprzątanie nie loguje liczb.
- Punkt startu żyje w pamięci 30 dni od użycia (wystarczą 1–2).
- Liczniki: `cel:` ponad 300 na dobę znikają bez śladu; 120 zdarzeń na godzinę na IP zaniży liczby za wspólnym adresem; doba UTC przesuwa powroty; brak minimalnej długości tokenu.
- Photon bez odstępu, limitu współbieżności i pauzy po 429 (zrobić przed falą); zegar ścienny w kolejce adresów.
- Polecenie ręcznej kopii w `server/README.md` używa kontenera `za-murem-serwer`, a compose ma `za-murem-api` (poprawić przy pierwszym wdrożeniu tej gałęzi, bo krok 0 na nim polega).

Gra:
- Start gry w trakcie powrotu kodem może założyć drugą drużynę.
- Komunikat po 429 obwinia limit także przy błędach sieci; dwa nakładające się odświeżenia mogą wysłać dwa punkty startu.
- `poWczytaniu` zajmuje siedzibę przed punktem startu, więc po restarcie serwera i zajętej siedzibie wczytanie kosztuje 2 z 5 zmian okolicy.
- Przy zablokowanych ciasteczkach każda gra zakłada osieroconą drużynę i pokazuje mylący komunikat.
- Kod wydany, a odpowiedź zgubiona: brak okna (ratuje Menu); `kod()` bez strażnika numeru gry.
- CSS telefonu dla tonu menu obejmuje też panel budowy i „Jak grać” (sprawdzić na zrzutach).
- Po powrocie kodem wpisanie adresu od nowa nadpisuje zapis w chmurze bez pytania.
- Liczniki: drobne zawyżenia (ponowny start po przegranym wyścigu, stary zapis bez celów, tablet liczy się jako telefon).

Informacja o danych (do rundy zatwierdzania z Mateuszem):
- Podstawy prawne, kraj serwera, przekazywanie poza EOG (Vercel, Google), pełna lista praw, procedura usunięcia konta z nickiem.
- „Najwyżej” przy 180 i 30 dniach sesji; dwuznaczne zdanie o wyłączonym serwerze; kotwica języka w odnośniku stopki.

Wdrożenie:
- `ZM_PROD` inne niż `1` robi zwykłe wdrożenie; `origin` nieprzypięty do `agentsmill/za-murem`; wąski refspec może zostawić stare `origin/main`; `cat >>` do Caddyfile bez sprawdzenia statusu; `rsync` z listą plików nie kasuje usuniętych plików serwera.
- Sprawdzenia podglądu z `deploy/hetzner/README.md`: podrobiony `X-Real-IP`, zapis 2–3 MB, parametr `q`, `api-prod` po zwykłym wdrożeniu; ruch `/api` przez Vercel wobec limitów planu Hobby.

Testy:
- Część testów informacji o danych pilnuje tekstu, nie zachowania (brak testu „nowa kopia pada, stare zostają”); ślad stosu z `determinizm-latka.test.ts` w pełnym przebiegu (sprzed tej gałęzi); `serwer-main.test.ts` bywa niestabilny pod obciążeniem.
