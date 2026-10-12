-- Each team belongs to a year and a season. Existing teams get the year and
-- season they were created in; coaches can change them in team settings.

ALTER TABLE team ADD COLUMN year INTEGER;
ALTER TABLE team ADD COLUMN season TEXT CHECK (season IN ('spring', 'summer', 'fall', 'winter'));

UPDATE team SET
  year = CAST(strftime('%Y', created_at) AS INTEGER),
  season = CASE
    WHEN CAST(strftime('%m', created_at) AS INTEGER) BETWEEN 3 AND 5 THEN 'spring'
    WHEN CAST(strftime('%m', created_at) AS INTEGER) BETWEEN 6 AND 7 THEN 'summer'
    WHEN CAST(strftime('%m', created_at) AS INTEGER) BETWEEN 8 AND 11 THEN 'fall'
    ELSE 'winter'
  END;
